import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { uuidv7 } from '@css/shared';
import type { Locale } from '@css/shared/i18n';
import {
  draftExpiry,
  type OtpSendRequest,
  type OtpVerifyRequest,
  REGISTRATION_RULES,
  type ReferenceLookupRequest,
  type RegistrationKind,
  type RegistrationStart,
  type RegistrationStartRequest,
  type RegistrationVerified,
} from '@css/shared/registration';
import { type AuditEntry, type AuditWriter } from '../audit/audit-writer';
import { identifierHash, type OtpChannel, type OtpService } from '../auth/otp.service';
import type { Env } from '../config/env';
import type { Clock } from '../core/clock';
import type { PrismaService } from '../core/prisma.service';
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
      if (!exists)
        await tx.registrationDraft.update({
          where: { id: draft.id },
          data: { tokenHash: tokenHash(token), verifiedAt: now, expiresAt },
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
      kind: draft.kind as RegistrationKind,
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
    return users.some((u) => {
      if (u.state !== 'deactivated') return true;
      return u.kind === 'volunteer'
        ? Boolean(u.volunteersUser?.approvedAt)
        : u._count.userRolesUser > 0;
    });
  }

  /** The name of the active volunteer with this NID, for a team member's reference (D-088). */
  async referenceLookup(
    body: ReferenceLookupRequest,
    token: string | undefined,
  ): Promise<{ name: string }> {
    const draft = await this.ownedDraft(body.registrationId, token);
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
      nidHash: identifierHash(this.env, `nid:${body.nid}`),
      found: Boolean(volunteer),
    });
    this.events.emit({ type: 'registration.reference_lookup', draftId: draft.id });
    if (!volunteer) throw new ApiError('permission.not_found', 404);
    return { name: volunteer.user.displayName };
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
