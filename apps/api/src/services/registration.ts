import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { uuidv7 } from '@css/shared';
import { checkPassword, minPasswordLength } from '@css/shared/auth';
import { commonPasswords } from '@css/shared/auth/common-passwords';
import { z } from 'zod';
import type { Locale } from '@css/shared/i18n';
import {
  draftExpiry,
  type OtpSendRequest,
  type OtpVerifyRequest,
  REGISTRATION_RULES,
  type ReferenceLookupRequest,
  REGISTRATION_KINDS,
  type RegistrationKind,
  type RegistrationStart,
  type RegistrationStartRequest,
  type RegistrationSubmitRequest,
  type StaffRegistrationSubmit,
  type VolunteerRegistrationSubmit,
  type RegistrationVerified,
} from '@css/shared/registration';
import { type AuditEntry, type AuditWriter } from '../audit/audit-writer';
import { identifierHash, type OtpChannel, type OtpService } from '../auth/otp.service';
import type { PasswordHasher } from '../auth/password-hasher';
import type { Env } from '../config/env';
import type { Clock } from '../core/clock';
import type { PrismaService, Tx } from '../core/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { ApiError } from '../i18n/api-error';
import type { RegistrationEvents } from '../notifications/registration-events';

type Draft = NonNullable<Awaited<ReturnType<PrismaService['registrationDraft']['findUnique']>>>;

const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');

/** The same error with the field it belongs to, so the screen can mark the right code box. */
function onField(error: unknown, path: string): unknown {
  if (!(error instanceof ApiError)) return error;
  return new ApiError(
    error.code,
    error.status,
    error.params,
    [{ path, code: error.code }],
    error.retryAfterSeconds,
  );
}

/**
 * Registration before login (AUTH.md 2; DECISION_LOG D-082, D-086, D-088): a draft between start
 * and submit, the two codes, the draft token and the team member's reference lookup.
 */
export class RegistrationService {
  constructor(
    private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly otp: OtpService,
    private readonly audit: AuditWriter,
    private readonly events: RegistrationEvents,
    private readonly hasher: PasswordHasher,
  ) {}

  private draftAudit(action: string, draftId: string, extra: AuditEntry['new'] = {}) {
    return this.prisma
      .$transaction((tx) =>
        this.audit.record(tx, {
          action,
          entityType: 'registration_draft',
          entityId: draftId,
          new: extra,
        }),
      )
      .then(() => undefined);
  }

  /** Starts a registration, or resumes the open draft of the same contacts, and sends both codes. */
  async start(body: RegistrationStartRequest, locale: Locale): Promise<RegistrationStart> {
    const now = this.clock.now();
    const open = await this.prisma.registrationDraft.findFirst({
      where: {
        mobile: body.mobile,
        email: body.email,
        kind: body.kind,
        submittedAt: null,
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    const id = open?.id ?? uuidv7();
    await this.prisma.$transaction(async (tx) => {
      if (!open)
        await tx.registrationDraft.create({
          data: {
            id,
            kind: body.kind,
            mobile: body.mobile,
            email: body.email,
            expiresAt: draftExpiry(now),
          },
        });
      await this.audit.record(tx, {
        action: 'auth.register_started',
        entityType: 'registration_draft',
        entityId: id,
        new: { kind: body.kind, resumed: Boolean(open) },
      });
    });
    for (const channel of ['sms', 'email'] as const) await this.send(channel, body, locale);
    this.events.emit({ type: 'registration.started', draftId: id });
    return { registrationId: id, otpSentTo: ['sms', 'email'] };
  }

  /** Sends one code again (AUTH.md 2: 5 per address and hour). */
  async resend(body: OtpSendRequest, locale: Locale): Promise<void> {
    const draft = await this.openDraft(body.registrationId);
    await this.send(body.channel, draft, locale);
    await this.draftAudit('auth.otp_sent', draft.id, { channel: body.channel });
  }

  private send(channel: OtpChannel, to: { mobile: string; email: string }, locale: Locale) {
    return this.otp.issue(
      { purpose: 'registration', channel, address: channel === 'sms' ? to.mobile : to.email },
      {
        locale,
        templateKey: channel === 'sms' ? 'otp_registration_sms' : 'otp_registration_email',
      },
    );
  }

  /**
   * Verifies both codes; only then reports a contact of an existing account (D-086). Returns the
   * draft token once and stores its hash (D-082).
   */
  async verify(body: OtpVerifyRequest): Promise<RegistrationVerified> {
    const draft = await this.openDraft(body.registrationId);
    const codes: string[] = [];
    for (const [channel, address, code, path] of [
      ['sms', draft.mobile, body.mobileCode, 'mobileCode'],
      ['email', draft.email, body.emailCode, 'emailCode'],
    ] as const) {
      try {
        codes.push(await this.otp.check({ purpose: 'registration', address }, code));
      } catch (error) {
        await this.draftAudit('auth.otp_failed', draft.id, {
          channel,
          code: error instanceof ApiError ? error.code : 'error',
        });
        throw onField(error, path);
      }
    }
    const exists = await this.contactTaken(draft.mobile, draft.email);
    const now = this.clock.now();
    const token = randomBytes(32).toString('base64url');
    const expiresAt = draftExpiry(now);
    await this.prisma.$transaction(async (tx) => {
      for (const id of codes)
        if (!(await this.otp.consume(tx, id))) throw new ApiError('otp.invalid', 422);
      // A taken contact also ends an earlier verification of this draft (its token stops working).
      await tx.registrationDraft.update({
        where: { id: draft.id },
        data: exists
          ? { tokenHash: null, verifiedAt: null }
          : { tokenHash: tokenHash(token), verifiedAt: now, expiresAt },
      });
      await this.audit.record(tx, {
        action: 'auth.otp_verified',
        entityType: 'registration_draft',
        entityId: draft.id,
        new: { accountExists: exists },
      });
    });
    if (exists) throw new ApiError('registration.account_exists', 409);
    this.events.emit({ type: 'registration.verified', draftId: draft.id });
    return {
      registrationToken: token,
      expiresAt: expiresAt.toISOString(),
      kind: z.enum(REGISTRATION_KINDS).parse(draft.kind),
    };
  }

  /**
   * True when the mobile or email belongs to an account other than a rejected, never-approved
   * one (D-086): a volunteer never approved, or an official who never received a role.
   */
  private async contactTaken(mobile: string, email: string): Promise<boolean> {
    const users = await this.prisma.user.findMany({
      where: { OR: [{ mobile }, { email }] },
      select: {
        kind: true,
        state: true,
        volunteersUser: { select: { approvedAt: true } },
        _count: { select: { userRolesUser: true } },
      },
    });
    return users.some(isTaken);
  }

  /** The name of the active volunteer with this NID, for a team member's reference (D-088). */
  async referenceLookup(
    body: ReferenceLookupRequest,
    token: string | undefined,
  ): Promise<{ name: string }> {
    const draft = await this.ownedDraft(body.registrationId, token);
    const nidHash = identifierHash(this.env, `nid:${body.nid}`);
    const sameNid = await this.prisma.auditLog.count({
      where: {
        action: 'auth.reference_lookup',
        createdAt: { gt: new Date(this.clock.now().getTime() - 86_400_000) },
        new: { path: ['nidHash'], equals: nidHash },
      },
    });
    if (sameNid >= REGISTRATION_RULES.maxLookupsPerNidPerDay)
      throw new ApiError('rate_limit.exceeded', 429);
    const reserved = await this.prisma.registrationDraft.updateMany({
      where: { id: draft.id, referenceLookups: { lt: REGISTRATION_RULES.maxReferenceLookups } },
      data: { referenceLookups: { increment: 1 } },
    });
    if (reserved.count === 0) throw new ApiError('rate_limit.exceeded', 429);
    const volunteer = await this.prisma.volunteer.findFirst({
      where: { nid: body.nid, user: { state: 'active' } },
      select: { user: { select: { displayName: true } } },
    });
    await this.draftAudit('auth.reference_lookup', draft.id, {
      nidHash,
      found: Boolean(volunteer),
    });
    this.events.emit({ type: 'registration.reference_lookup', draftId: draft.id });
    if (!volunteer) throw new ApiError('permission.not_found', 404);
    return { name: volunteer.user.displayName };
  }

  /**
   * Submits the form of the draft's kind (plan
   * docs/plans/2026-10-12-1541-feat-registration-approval-handover-plan.md, R2, R5, R6, R21): one
   * transaction creates the pending account and the volunteer row (or the staff fields and the
   * photo link), or returns a rejected, never-approved account to pending, and spends the draft
   * token. Returns the user id.
   */
  async submit(body: RegistrationSubmitRequest, token: string | undefined): Promise<string> {
    const draft = await this.ownedDraft(body.registrationId, token);
    if (body.kind !== draft.kind) throw invalid('kind', 'validation.option_unknown');
    const problems = checkPassword(body.password, {
      minLength: minPasswordLength(false),
      mobile: draft.mobile,
      email: draft.email,
      common: commonPasswords(),
    });
    if (problems.length)
      throw new ApiError(
        'validation.failed',
        422,
        undefined,
        problems.map((code) => ({ path: 'password', code })),
      );
    if (body.kind === 'volunteer') await this.assertAddress(body);
    else await this.assertStaffPlace(body);
    const referenceVolunteerId =
      body.kind === 'volunteer' && body.type === 'team_member'
        ? await this.mainVolunteer(body.referenceNid!)
        : null;
    const passwordHash = await this.hasher.hash(body.password);
    const now = this.clock.now();
    let userId: string;
    try {
      userId = await this.prisma.$transaction(async (tx) => {
        const [locked] = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM registration_drafts
           WHERE id = ${draft.id}::uuid AND submitted_at IS NULL FOR UPDATE`;
        if (!locked) throw new ApiError('registration.token_invalid', 401);
        const reuse = await this.reusableAccount(tx, draft, body.kind);
        if (body.kind === 'volunteer') {
          const sameNid = await tx.volunteer.count({
            where: { nid: body.nid, ...(reuse ? { NOT: { userId: reuse.id } } : {}) },
          });
          if (sameNid) throw new ApiError('registration.nid_exists', 409);
        }
        const account = {
          kind: body.kind,
          mobile: draft.mobile,
          email: draft.email,
          passwordHash,
          state: 'pending',
          displayName: body.name,
          designation: body.kind === 'staff' ? body.designation : null,
          homeProgramId: body.kind === 'staff' ? body.homeProgramId : null,
          homeDivisionId: body.kind === 'staff' ? body.homeDivisionId : null,
          failedLoginCount: 0,
          lockedUntil: null,
          deactivatedAt: null,
        };
        const id = reuse?.id ?? uuidv7();
        if (reuse) await tx.user.update({ where: { id }, data: account });
        else await tx.user.create({ data: { id, ...account } });
        if (body.kind === 'volunteer') {
          const profile = volunteerColumns(body, referenceVolunteerId, draft);
          await tx.volunteer.upsert({
            where: { userId: id },
            create: { id: uuidv7(), userId: id, ...profile },
            update: profile,
          });
        } else if (draft.photoFileId) {
          await tx.fileLink.create({
            data: {
              id: uuidv7(),
              fileId: draft.photoFileId,
              entityType: 'user',
              entityId: id,
              slot: 'photo',
            },
          });
        }
        await tx.registrationDraft.update({
          where: { id: draft.id },
          data: { submittedUserId: id, submittedAt: now, tokenHash: null },
        });
        // Personal identifiers stay out of the entry (RBAC.md 6): kinds and names only.
        await this.audit.record(tx, {
          action: 'auth.registered',
          entityType: 'user',
          entityId: id,
          actorUserId: id,
          old: reuse
            ? { state: reuse.state, displayName: reuse.displayName, designation: reuse.designation }
            : null,
          new: {
            kind: body.kind,
            registrationId: draft.id,
            reusedAccount: Boolean(reuse),
            ...(body.kind === 'volunteer' ? { type: body.type } : {}),
          },
        });
        return id;
      });
    } catch (error) {
      // a parallel submit with the same NID or contact lost the race to the unique indexes
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new ApiError(
          JSON.stringify(error.meta ?? {}).includes('nid')
            ? 'registration.nid_exists'
            : 'registration.account_exists',
          409,
        );
      throw error;
    }
    this.events.emit({ type: 'registration.submitted', userId });
    return userId;
  }

  /**
   * The account a submit may take over (D-086): none when the contacts are free; the one rejected,
   * never-approved account of the same kind; anything else is `registration.account_exists`.
   */
  private async reusableAccount(tx: Tx, draft: Draft, kind: RegistrationKind) {
    const users = await tx.user.findMany({
      where: { OR: [{ mobile: draft.mobile }, { email: draft.email }] },
      select: {
        id: true,
        kind: true,
        state: true,
        displayName: true,
        designation: true,
        volunteersUser: { select: { approvedAt: true } },
        _count: { select: { userRolesUser: true } },
      },
    });
    if (!users.length) return null;
    const [user] = users;
    if (users.length > 1 || !user || user.kind !== kind || isTaken(user))
      throw new ApiError('registration.account_exists', 409);
    return user;
  }

  /** The division, district, upazila and union exist, are active and form one chain. */
  private async assertAddress(body: VolunteerRegistrationSubmit): Promise<void> {
    const chain = [
      ['divisionId', body.divisionId, 'division', null],
      ['districtId', body.districtId, 'district', body.divisionId],
      ['upazilaId', body.upazilaId, 'upazila', body.districtId],
      ['unionId', body.unionId, 'union', body.upazilaId],
    ] as const;
    const rows = await this.prisma.location.findMany({
      where: { id: { in: chain.map(([, id]) => id) }, active: true },
      select: { id: true, level: true, parentId: true },
    });
    for (const [path, id, level, parent] of chain) {
      const row = rows.find((r) => r.id === id);
      if (!row || row.level !== level || (parent !== null && row.parentId !== parent))
        throw invalid(path, 'validation.option_unknown');
    }
  }

  private async assertStaffPlace(body: StaffRegistrationSubmit): Promise<void> {
    const program = await this.prisma.program.count({
      where: { id: body.homeProgramId, active: true },
    });
    if (!program) throw invalid('homeProgramId', 'validation.option_unknown');
    const division = await this.prisma.location.count({
      where: { id: body.homeDivisionId, level: 'division', active: true },
    });
    if (!division) throw invalid('homeDivisionId', 'validation.option_unknown');
  }

  /** The active volunteer a team member names as reference (R3). */
  private async mainVolunteer(nid: string): Promise<string> {
    const main = await this.prisma.volunteer.findFirst({
      where: { nid, user: { state: 'active' } },
      select: { id: true },
    });
    if (!main) throw invalid('referenceNid', 'validation.option_unknown');
    return main.id;
  }

  /** An unsubmitted draft before its expiry: 404 when unknown or submitted, 410 when expired. */
  private async openDraft(id: string): Promise<Draft> {
    const draft = await this.prisma.registrationDraft.findUnique({ where: { id } });
    if (!draft || draft.submittedAt) throw new ApiError('permission.not_found', 404);
    if (draft.expiresAt <= this.clock.now()) throw new ApiError('registration.draft_expired', 410);
    return draft;
  }

  /**
   * A verified draft whose token the caller holds (NE-SEC-03): a missing or wrong token, an
   * unknown or unverified draft all answer 401, so the answer reveals nothing about the draft.
   */
  async ownedDraft(id: string, token: string | undefined): Promise<Draft> {
    const draft = await this.prisma.registrationDraft.findUnique({ where: { id } });
    const expected = draft?.tokenHash ? Buffer.from(draft.tokenHash) : null;
    const given = Buffer.from(tokenHash(token ?? ''));
    if (
      !draft ||
      !token ||
      draft.submittedAt ||
      !expected ||
      expected.length !== given.length ||
      !timingSafeEqual(expected, given)
    )
      throw new ApiError('registration.token_invalid', 401);
    if (draft.expiresAt <= this.clock.now()) throw new ApiError('registration.draft_expired', 410);
    return draft;
  }
}

/** A contact is taken unless its account was rejected and never approved (D-086). */
function isTaken(u: {
  kind: string;
  state: string;
  volunteersUser: { approvedAt: Date | null } | null;
  _count: { userRolesUser: number };
}): boolean {
  if (u.state !== 'deactivated') return true;
  return u.kind === 'volunteer'
    ? Boolean(u.volunteersUser?.approvedAt)
    : u._count.userRolesUser > 0;
}

function invalid(path: string, code: string): ApiError {
  return new ApiError('validation.failed', 422, undefined, [{ path, code }]);
}

/** The volunteers columns of the form; the photos come from the draft. */
function volunteerColumns(
  body: VolunteerRegistrationSubmit,
  referenceVolunteerId: string | null,
  draft: { photoFileId: string | null; nidPhotoFileId: string | null },
) {
  return {
    nid: body.nid,
    type: body.type,
    fatherName: body.fatherName,
    motherName: body.motherName,
    whatsapp: body.whatsapp ?? null,
    divisionId: body.divisionId,
    districtId: body.districtId,
    upazilaId: body.upazilaId,
    unionId: body.unionId,
    addressLine: body.addressLine ?? null,
    education: body.education ?? null,
    experience: body.experience ?? null,
    workDescription: body.workDescription ?? null,
    previousProjects: body.previousProjects ?? null,
    facebookId: body.facebookId ?? null,
    bankName: body.bank?.bankName ?? null,
    bankAccountName: body.bank?.accountName ?? null,
    bankAccountNumber: body.bank?.accountNumber ?? null,
    bankRoutingNumber: body.bank?.routingNumber ?? null,
    referenceNid: body.type === 'team_member' ? (body.referenceNid ?? null) : null,
    referenceVolunteerId,
    photoFileId: draft.photoFileId,
    nidPhotoFileId: draft.nidPhotoFileId,
  };
}
