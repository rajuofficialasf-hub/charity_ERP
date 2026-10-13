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
  type RegistrationVerifyResult,
} from '@css/shared/registration';
import { type AuditEntry, type AuditWriter } from '../audit/audit-writer';
import { identifierHash, type OtpService } from '../auth/otp.service';
import type { PasswordHasher } from '../auth/password-hasher';
import type { Env } from '../config/env';
import type { Clock } from '../core/clock';
import type { PrismaService, Tx } from '../core/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { ApiError } from '../i18n/api-error';
import type { RegistrationEvents } from '../notifications/registration-events';

type Draft = NonNullable<Awaited<ReturnType<PrismaService['registrationDraft']['findUnique']>>>;
/** A draft with its token: both contacts are set and verified (CHECKs of D-090). */
type VerifiedDraft = Draft & { mobile: string; email: string };

/** An address in the audit: enough to tell two sends apart, not enough to read it (D-090). */
function maskAddress(address: string): string {
  const at = address.indexOf('@');
  if (at > 0) return `${address[0]}•••${address.slice(at)}`;
  return `${address.slice(0, 2)}•••••••${address.slice(-2)}`;
}

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

  /** Starts a draft of the kind; nothing is sent, each contact comes with its own code (D-090). */
  async start(body: RegistrationStartRequest): Promise<RegistrationStart> {
    const id = uuidv7();
    await this.prisma.$transaction(async (tx) => {
      await tx.registrationDraft.create({
        data: { id, kind: body.kind, expiresAt: draftExpiry(this.clock.now()) },
      });
      await this.audit.record(tx, {
        action: 'auth.register_started',
        entityType: 'registration_draft',
        entityId: id,
        new: { kind: body.kind },
      });
    });
    this.events.emit({ type: 'registration.started', draftId: id });
    return { registrationId: id };
  }

  /**
   * Sends a code to one contact of the draft (D-090). The address replaces the channel's earlier
   * one, and a changed address clears that channel's verification; a verified channel with the
   * same address and a draft that holds its token are refused (409). The send is counted on the
   * draft first (6 in its lifetime, across channels and address changes), then per address by
   * the OTP service (5 per hour). The answer is the same whether or not the address belongs to an
   * account (D-086).
   */
  async send(body: OtpSendRequest, locale: Locale): Promise<void> {
    const draft = await this.openDraft(body.registrationId);
    const sms = body.channel === 'sms';
    const current = sms ? draft.mobile : draft.email;
    const verifiedAt = sms ? draft.mobileVerifiedAt : draft.emailVerifiedAt;
    if (draft.verifiedAt || (verifiedAt && current === body.address))
      throw new ApiError('registration.already_verified', 409);
    const contact = sms
      ? { mobile: body.address, mobileVerifiedAt: null }
      : { email: body.address, emailVerifiedAt: null };
    const counted = await this.prisma.registrationDraft.updateMany({
      where: {
        id: draft.id,
        verifiedAt: null,
        otpSends: { lt: REGISTRATION_RULES.maxSendsPerDraft },
      },
      data: { otpSends: { increment: 1 }, ...contact },
    });
    if (counted.count === 0) throw new ApiError('rate_limit.exceeded', 429);
    await this.otp.issue(
      { purpose: 'registration', channel: body.channel, address: body.address },
      { locale, templateKey: sms ? 'otp_registration_sms' : 'otp_registration_email' },
    );
    await this.draftAudit('auth.otp_sent', draft.id, {
      channel: body.channel,
      address: maskAddress(body.address),
    });
  }

  /**
   * Verifies the code of one channel (D-090). The draft row is locked, so two channels verified
   * at once still end in one token. Once both are verified the contacts are checked: a mobile or
   * email of an existing account clears both verifications and answers
   * `registration.account_exists` (D-086); otherwise the draft token is returned once and only its
   * hash is stored (D-082).
   */
  async verify(body: OtpVerifyRequest): Promise<RegistrationVerifyResult> {
    const draft = await this.openDraft(body.registrationId);
    if (draft.verifiedAt) throw new ApiError('registration.already_verified', 409);
    const sms = body.channel === 'sms';
    const address = sms ? draft.mobile : draft.email;
    let codeId: string;
    try {
      if (!address) throw new ApiError('otp.invalid', 422);
      codeId = await this.otp.check({ purpose: 'registration', address }, body.code);
    } catch (error) {
      await this.draftAudit('auth.otp_failed', draft.id, {
        channel: body.channel,
        code: error instanceof ApiError ? error.code : 'error',
      });
      throw onField(error, 'code');
    }
    const now = this.clock.now();
    const token = randomBytes(32).toString('base64url');
    const expiresAt = draftExpiry(now);
    const outcome = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM registration_drafts WHERE id = ${draft.id}::uuid FOR UPDATE`;
      const fresh = await tx.registrationDraft.findUniqueOrThrow({ where: { id: draft.id } });
      // the address changed or the draft was verified while the code was checked
      if (fresh.verifiedAt || (sms ? fresh.mobile : fresh.email) !== address)
        throw new ApiError('otp.invalid', 422, undefined, [{ path: 'code', code: 'otp.invalid' }]);
      if (!(await this.otp.consume(tx, codeId))) throw new ApiError('otp.invalid', 422);
      const mark = sms ? { mobileVerifiedAt: now } : { emailVerifiedAt: now };
      const other = sms ? fresh.emailVerifiedAt : fresh.mobileVerifiedAt;
      const record = (extra: Record<string, unknown>) =>
        this.audit.record(tx, {
          action: 'auth.otp_verified',
          entityType: 'registration_draft',
          entityId: draft.id,
          new: { channel: body.channel, ...extra },
        });
      if (!other || !fresh.mobile || !fresh.email) {
        await tx.registrationDraft.update({
          where: { id: draft.id },
          data: { ...mark, expiresAt },
        });
        await record({});
        return { done: false as const };
      }
      const exists = await this.contactTaken(tx, fresh.mobile, fresh.email, fresh.kind);
      const kind = z.enum(REGISTRATION_KINDS).parse(fresh.kind);
      const programs = kind === 'staff' && !exists ? await this.activePrograms(tx) : undefined;
      await tx.registrationDraft.update({
        where: { id: draft.id },
        // a taken contact verifies nothing: both channels start again
        data: exists
          ? { mobileVerifiedAt: null, emailVerifiedAt: null, tokenHash: null, verifiedAt: null }
          : { ...mark, tokenHash: tokenHash(token), verifiedAt: now, expiresAt },
      });
      await record({ accountExists: exists });
      return { done: true as const, exists, kind, programs };
    });
    if (!outcome.done) return { verified: [body.channel] };
    if (outcome.exists) throw new ApiError('registration.account_exists', 409);
    this.events.emit({ type: 'registration.verified', draftId: draft.id });
    return {
      verified: ['sms', 'email'],
      registrationToken: token,
      expiresAt: expiresAt.toISOString(),
      kind: outcome.kind,
      // the staff form names a program: a draft for an official gets the active program names
      // once both codes are verified (names only; programs are not personal data)
      ...(outcome.programs ? { programs: outcome.programs } : {}),
    };
  }

  private async activePrograms(db: Pick<Tx, 'program'>) {
    const rows = await db.program.findMany({
      where: { active: true },
      orderBy: { code: 'asc' },
      select: { id: true, nameBn: true, nameEn: true },
    });
    return rows.map((p) => ({ id: p.id, name: { bn: p.nameBn, en: p.nameEn } }));
  }

  /**
   * True when the mobile or email belongs to an account other than a rejected, never-approved
   * one of the same kind (D-086): a volunteer never approved, or an official who never received a
   * role. A rejected account of the other kind is taken, so the person learns it at verification.
   */
  private async contactTaken(
    db: Pick<Tx, 'user'>,
    mobile: string,
    email: string,
    kind: string,
  ): Promise<boolean> {
    const users = await db.user.findMany({
      where: { OR: [{ mobile }, { email }] },
      select: {
        kind: true,
        state: true,
        volunteersUser: { select: { approvedAt: true } },
        _count: { select: { userRolesUser: true } },
      },
    });
    return users.some((u) => isTaken(u, kind));
  }

  /** The name of the active volunteer with this NID, for a team member's reference (D-088). */
  async referenceLookup(
    body: ReferenceLookupRequest,
    token: string | undefined,
  ): Promise<{ name: string }> {
    const draft = await this.ownedDraft(body.registrationId, token);
    const volunteer = await this.countedLookup(draft.id, body.nid);
    if (!volunteer) throw new ApiError('permission.not_found', 404);
    return { name: volunteer.name };
  }

  /**
   * Whether an NID belongs to an active volunteer, counted and audited (D-088): 5 per draft and 5
   * per NID and day across drafts, each one an `auth.reference_lookup` entry with the NID hashed.
   * The reference lookup and the team member's submit both go through here, so the submit is no
   * unmetered way to test NIDs.
   */
  private async countedLookup(
    draftId: string,
    nid: string,
  ): Promise<{ id: string; name: string } | null> {
    const nidHash = identifierHash(this.env, `nid:${nid}`);
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
      where: { id: draftId, referenceLookups: { lt: REGISTRATION_RULES.maxReferenceLookups } },
      data: { referenceLookups: { increment: 1 } },
    });
    if (reserved.count === 0) throw new ApiError('rate_limit.exceeded', 429);
    const volunteer = await this.prisma.volunteer.findFirst({
      where: { nid, user: { state: 'active' } },
      select: { id: true, user: { select: { displayName: true } } },
    });
    await this.draftAudit('auth.reference_lookup', draftId, { nidHash, found: Boolean(volunteer) });
    this.events.emit({ type: 'registration.reference_lookup', draftId });
    return volunteer ? { id: volunteer.id, name: volunteer.user.displayName } : null;
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
    const refused = await this.prisma.auditLog.count({
      where: {
        action: 'auth.register_refused',
        entityType: 'registration_draft',
        entityId: draft.id,
      },
    });
    if (refused >= REGISTRATION_RULES.maxRefusedSubmits)
      throw new ApiError('rate_limit.exceeded', 429);
    try {
      return await this.submitDraft(draft, body);
    } catch (error) {
      // A refused submit is counted on the draft, so one verified draft cannot test NIDs or
      // references without end (C5 review of the plan of this task).
      if (error instanceof ApiError && [409, 422].includes(error.status))
        await this.draftAudit('auth.register_refused', draft.id, { code: error.code });
      throw error;
    }
  }

  private async submitDraft(
    draft: VerifiedDraft,
    body: RegistrationSubmitRequest,
  ): Promise<string> {
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
    const [referenceVolunteerId, passwordHash] = await Promise.all([
      body.kind === 'volunteer' && body.type === 'team_member'
        ? this.mainVolunteer(draft.id, body.referenceNid!)
        : null,
      this.hasher.hash(body.password),
    ]);
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
          await this.linkStaffPhoto(tx, id, draft.photoFileId);
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
      // A parallel submit with the same NID or contact lost the race to the unique indexes. The
      // driver adapter does not always fill `meta.target`, so the whole meta is searched.
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
   * The staff photo link: a returning official's link is moved to the new photo (the API role
   * cannot delete rows); the earlier photo stays with the earlier submitted draft (BD-46).
   */
  private async linkStaffPhoto(tx: Tx, userId: string, fileId: string): Promise<void> {
    const moved = await tx.fileLink.updateMany({
      where: { entityType: 'user', entityId: userId, slot: 'photo' },
      data: { fileId },
    });
    if (moved.count === 0)
      await tx.fileLink.create({
        data: { id: uuidv7(), fileId, entityType: 'user', entityId: userId, slot: 'photo' },
      });
  }

  /**
   * The account a submit may take over (D-086): none when the contacts are free; the one rejected,
   * never-approved account of the same kind; anything else is `registration.account_exists`.
   */
  private async reusableAccount(tx: Tx, draft: VerifiedDraft, kind: RegistrationKind) {
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
    if (users.length > 1 || !user || isTaken(user, kind))
      throw new ApiError('registration.account_exists', 409);
    return user;
  }

  /** The division, district, upazila and union exist, are active and form one chain. */
  private async assertAddress(body: VolunteerRegistrationSubmit): Promise<void> {
    const problem = await addressProblem(this.prisma, body);
    if (problem) throw invalid(problem, 'validation.option_unknown');
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

  /** The active volunteer a team member names as reference (R3), through the counted lookup. */
  private async mainVolunteer(draftId: string, nid: string): Promise<string> {
    const main = await this.countedLookup(draftId, nid);
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
  async ownedDraft(id: string, token: string | undefined): Promise<VerifiedDraft> {
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
    // a token exists only with both contacts verified (registration_drafts_channels_check)
    if (!draft.mobile || !draft.email) throw new ApiError('registration.token_invalid', 401);
    return { ...draft, mobile: draft.mobile, email: draft.email };
  }
}

/** A contact is taken unless its account of the same kind was rejected and never approved (D-086). */
function isTaken(
  u: {
    kind: string;
    state: string;
    volunteersUser: { approvedAt: Date | null } | null;
    _count: { userRolesUser: number };
  },
  kind: string,
): boolean {
  if (u.state !== 'deactivated' || u.kind !== kind) return true;
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
  draft: {
    photoFileId: string | null;
    nidPhotoFileId: string | null;
    nidPhotoBackFileId: string | null;
  },
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
    nidPhotoBackFileId: draft.nidPhotoBackFileId,
  };
}

/**
 * The first address field that is unknown, inactive or outside its parent (division → district →
 * upazila → union), or null when the four form one chain. Shared by the submit and the corrections.
 */
export async function addressProblem(
  db: Pick<PrismaService, 'location'>,
  address: { divisionId: string; districtId: string; upazilaId: string; unionId: string },
): Promise<string | null> {
  const chain = [
    ['divisionId', address.divisionId, 'division', null],
    ['districtId', address.districtId, 'district', address.divisionId],
    ['upazilaId', address.upazilaId, 'upazila', address.districtId],
    ['unionId', address.unionId, 'union', address.upazilaId],
  ] as const;
  const rows = await db.location.findMany({
    where: { id: { in: chain.map(([, id]) => id) }, active: true },
    select: { id: true, level: true, parentId: true },
  });
  for (const [path, id, level, parent] of chain) {
    const row = rows.find((r) => r.id === id);
    if (!row || row.level !== level || (parent !== null && row.parentId !== parent)) return path;
  }
  return null;
}
