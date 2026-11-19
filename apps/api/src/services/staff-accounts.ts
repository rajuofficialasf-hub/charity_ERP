import { createHash, randomBytes } from 'node:crypto';
import { NOTIFICATION_TEMPLATES, uuidv7 } from '@css/shared';
import {
  checkPassword,
  type InvitationAcceptRequest,
  type InvitationIssued,
  type InvitationRenewRequest,
  type InvitationView,
  minPasswordLength,
  type StaffCreateRequest,
  type StaffProfileRequest,
} from '@css/shared/auth';
import { type Locale, renderNotification } from '@css/shared/i18n';
import type { Logger } from 'pino';
import { roleRefusal } from '../access/hard-rules.js';
import type { AccessRegistry } from '../access/registry.js';
import type { Scope } from '../access/scope.js';
import type { AccessService } from '../access/service.js';
import { type AuditWriter } from '../audit/audit-writer.js';
import { type PasswordHasher } from '../auth/password-hasher.js';
import type { Principal } from '../auth/principal.js';
import type { Env } from '../config/env.js';
import type { Clock } from '../core/clock.js';
import { assertIfMatch } from '../core/etag.js';
import { type PrismaService, type Tx } from '../core/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { ApiError } from '../i18n/api-error.js';
import { DeliveryError, type EmailAdapter } from '../notifications/adapters.js';
import type { SettingsService } from './settings.js';
import { isGivableOfficialRole, refuseRole } from './registrations.js';

/** The set-password link: 72 hours, once. */
export const INVITATION_RULES = { validMs: 72 * 3_600_000 } as const;

const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');

/** How far a supervisor chain is followed before it counts as a loop (no real line is this deep). */
const MAX_CHAIN = 50;

const invalid = (path: string, code: string) =>
  new ApiError('validation.failed', 422, undefined, [{ path, code }]);

type ProfileRefs = Pick<
  StaffProfileRequest,
  'homeProgramId' | 'homeDivisionId' | 'supervisorUserId'
>;

/**
 * Officials created by the admin (docs/architecture/AUTH.md, "Officials created by the admin"): the
 * account with its role and place, the set-password link (a random token stored only as a SHA-256
 * hash, emailed and returned once so the admin can copy it), its renewal, and its use. The account
 * stays pending without a password until the link is used.
 */
export class StaffAccountsService {
  constructor(
    private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly audit: AuditWriter,
    private readonly access: AccessService,
    private readonly registry: AccessRegistry,
    private readonly hasher: PasswordHasher,
    private readonly email: EmailAdapter,
    private readonly logger: Logger,
    private readonly settings: SettingsService,
  ) {}

  /** Creates the pending account, gives the role and issues the link. */
  async create(actor: Principal, body: StaffCreateRequest): Promise<InvitationIssued> {
    if (!isGivableOfficialRole(this.registry, body.roleKey))
      throw invalid('roleKey', 'validation.option_unknown');
    // no account exists yet, so the refusal is kept on the account of the person who asked
    const rule = roleRefusal(this.registry, await this.access.rolesOf(actor.userId), body.roleKey);
    if (rule)
      await refuseRole(
        { prisma: this.prisma, audit: this.audit },
        rule,
        body.roleKey,
        actor.userId,
      );
    const id = uuidv7();
    // an official without a chosen language gets the system default language
    const language = body.language ?? (await this.settings.get('localization')).defaultLanguage;
    let issued: { token: string; invitationId: string; expiresAt: Date };
    try {
      issued = await this.prisma.$transaction(async (tx) => {
        await assertStaffRefs(tx, body, null);
        const taken = await this.taken(tx, body);
        if (taken) throw taken;
        await tx.user.create({
          data: {
            id,
            kind: 'staff',
            state: 'pending',
            email: body.email,
            mobile: body.mobile,
            displayName: body.displayName,
            designation: body.designation,
            jobId: body.jobId,
            affiliation: body.affiliation,
            affiliationUnit: body.affiliationUnit,
            homeProgramId: body.homeProgramId,
            homeDivisionId: body.homeDivisionId,
            supervisorUserId: body.supervisorUserId,
            language,
            createdBy: actor.userId,
            updatedBy: actor.userId,
          },
        });
        await tx.userRole.create({
          data: { id: uuidv7(), userId: id, roleKey: body.roleKey, grantedBy: actor.userId },
        });
        // contacts stay out of the audit entry; the user row holds them
        await this.audit.record(tx, {
          action: 'user.created',
          entityType: 'user',
          entityId: id,
          new: {
            jobId: body.jobId,
            role: body.roleKey,
            designation: body.designation,
            affiliation: body.affiliation,
            affiliationUnit: body.affiliationUnit,
            homeProgramId: body.homeProgramId,
            homeDivisionId: body.homeDivisionId,
            supervisorUserId: body.supervisorUserId,
          },
        });
        return this.issue(tx, actor, id, false);
      });
    } catch (error) {
      // two admins typing the same job ID or contact at once: the unique index answers
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw (await this.taken(this.prisma, body)) ?? error;
      throw error;
    }
    return this.deliver(id, issued);
  }

  /**
   * A new link for an account still without a password; the open one is revoked. A
   * corrected email replaces the stored one first, so a link sent to a mistyped address dies.
   */
  async reissue(
    actor: Principal,
    scope: Scope,
    userId: string,
    body: InvitationRenewRequest,
  ): Promise<InvitationIssued> {
    let issued: { token: string; invitationId: string; expiresAt: Date };
    try {
      issued = await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
        const user = await this.access.findUser(
          scope,
          userId,
          { id: true, kind: true, state: true, passwordHash: true, email: true },
          tx,
        );
        if (user.kind !== 'staff') throw new ApiError('user.not_staff', 409);
        if (user.state !== 'pending' || user.passwordHash)
          throw new ApiError('user.invitation_not_needed', 409);
        if (body.email && body.email !== user.email) {
          if (await tx.user.count({ where: { email: body.email } }))
            throw new ApiError('registration.account_exists', 409);
          await tx.user.update({
            where: { id: userId },
            data: { email: body.email, updatedBy: actor.userId },
          });
          // the addresses stay out of the audit entry; the change itself is recorded
          await this.audit.record(tx, {
            action: 'user.email_corrected',
            entityType: 'user',
            entityId: userId,
            new: { beforeSetPassword: true },
          });
        }
        return this.issue(tx, actor, userId, true);
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new ApiError('registration.account_exists', 409);
      throw error;
    }
    return this.deliver(userId, issued);
  }

  /** What the set-password page shows (no account details beyond the name and the job ID). */
  async inspect(token: string): Promise<InvitationView> {
    const { invitation, user } = await this.open(this.prisma, token);
    return {
      displayName: user.displayName,
      jobId: user.jobId ?? '',
      minPasswordLength: minPasswordLength(user.globalRole),
      expiresAt: invitation.expiresAt.toISOString(),
    };
  }

  /** Sets the first password through the link; the account becomes active. */
  async accept(body: InvitationAcceptRequest): Promise<void> {
    const first = await this.open(this.prisma, body.token);
    const problems = checkPassword(body.password, {
      minLength: minPasswordLength(first.user.globalRole),
    });
    if (problems.length)
      throw new ApiError(
        'validation.failed',
        422,
        undefined,
        problems.map((code) => ({ path: 'password', code })),
      );
    const passwordHash = await this.hasher.hash(body.password);
    await this.prisma.$transaction(async (tx) => {
      // the account first, then its link: the order a new link takes them, so neither waits forever
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${first.user.id}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM account_invitations WHERE id = ${first.invitation.id}::uuid FOR UPDATE`;
      // checked again under the lock: a second tab or a new link may have closed it meanwhile
      const { invitation, user } = await this.open(tx, body.token);
      const now = this.clock.now();
      await tx.accountInvitation.update({ where: { id: invitation.id }, data: { usedAt: now } });
      await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          state: 'active',
          failedLoginCount: 0,
          lockedUntil: null,
          updatedBy: user.id,
        },
      });
      await this.audit.record(tx, {
        action: 'auth.invitation_accepted',
        entityType: 'user',
        entityId: user.id,
        actorUserId: user.id,
        old: { state: 'pending' },
        new: { state: 'active', invitationId: invitation.id },
      });
    });
  }

  /** Replaces the profile of an official: job ID, name, place and supervisor. */
  async updateProfile(
    actor: Principal,
    scope: Scope,
    userId: string,
    body: StaffProfileRequest,
    ifMatch: string | undefined,
  ): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
        const user = await this.access.findUser(
          scope,
          userId,
          {
            id: true,
            kind: true,
            updatedAt: true,
            jobId: true,
            displayName: true,
            designation: true,
            affiliation: true,
            affiliationUnit: true,
            homeProgramId: true,
            homeDivisionId: true,
            supervisorUserId: true,
          },
          tx,
        );
        assertIfMatch(ifMatch, user.updatedAt);
        if (user.kind !== 'staff') throw new ApiError('user.not_staff', 409);
        await assertStaffRefs(tx, body, userId, user.supervisorUserId);
        if (body.jobId !== user.jobId) {
          const taken = await tx.user.count({
            where: { jobId: body.jobId, NOT: { id: userId } },
          });
          if (taken) throw new ApiError('user.job_id_taken', 409);
        }
        const { id: _id, kind: _kind, updatedAt: _at, ...before } = user;
        await tx.user.update({
          where: { id: userId },
          data: { ...body, updatedBy: actor.userId },
        });
        await this.audit.record(tx, {
          action: 'user.profile_changed',
          entityType: 'user',
          entityId: userId,
          old: before,
          new: body,
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new ApiError('user.job_id_taken', 409);
      throw error;
    }
  }

  /** Revokes the open link and stores a new one; the token itself is never stored. */
  private async issue(tx: Tx, actor: Principal, userId: string, reissued: boolean) {
    const now = this.clock.now();
    await tx.accountInvitation.updateMany({
      where: { userId, usedAt: null, revokedAt: null },
      data: { revokedAt: now },
    });
    const token = randomBytes(32).toString('base64url');
    const invitationId = uuidv7();
    const expiresAt = new Date(now.getTime() + INVITATION_RULES.validMs);
    await tx.accountInvitation.create({
      data: {
        id: invitationId,
        userId,
        tokenHash: tokenHash(token),
        expiresAt,
        createdAt: now,
        createdBy: actor.userId,
      },
    });
    await this.audit.record(tx, {
      action: 'user.invited',
      entityType: 'user',
      entityId: userId,
      new: { invitationId, expiresAt: expiresAt.toISOString(), reissued },
    });
    return { token, invitationId, expiresAt };
  }

  /**
   * Emails the link after the commit. A failed email keeps the account: the answer says so and
   * the admin copies the link instead.
   */
  private async deliver(
    userId: string,
    issued: { token: string; invitationId: string; expiresAt: Date },
  ): Promise<InvitationIssued> {
    const link = `${this.env.APP_ORIGIN.replace(/\/$/, '')}/invite#${issued.token}`;
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true, displayName: true, jobId: true, language: true },
    });
    let emailed = false;
    if (user.email) {
      const template = NOTIFICATION_TEMPLATES.find((t) => t.key === 'staff_invitation');
      if (!template) throw new Error('notification template staff_invitation missing');
      const text = renderNotification(template, 'email', user.language as Locale, {
        name: user.displayName,
        job_id: user.jobId ?? '',
        link,
        hours: String(INVITATION_RULES.validMs / 3_600_000),
      });
      try {
        await this.email.send({ to: user.email, subject: text.subject ?? '', text: text.body });
        emailed = true;
      } catch (error) {
        // the adapter's error names the SMTP class only, never the address
        this.logger.warn(
          { userId, reason: error instanceof DeliveryError ? error.message : 'error' },
          'set-password link not emailed; the admin copies it',
        );
      }
      if (emailed)
        await this.prisma.accountInvitation
          .update({ where: { id: issued.invitationId }, data: { emailed: true } })
          .catch((error: unknown) =>
            this.logger.warn(
              { userId, reason: (error as Error).name },
              'set-password link emailed but not marked',
            ),
          );
    }
    return { userId, link, expiresAt: issued.expiresAt.toISOString(), emailed };
  }

  /** The open link of a token and its account: 404 for an unknown token, 410 once closed. */
  private async open(db: Tx, token: string) {
    const invitation = await db.accountInvitation.findUnique({
      where: { tokenHash: tokenHash(token) },
      select: {
        id: true,
        expiresAt: true,
        usedAt: true,
        revokedAt: true,
        user: {
          select: {
            id: true,
            state: true,
            passwordHash: true,
            displayName: true,
            jobId: true,
            userRolesUser: { where: { revokedAt: null }, select: { role: true } },
          },
        },
      },
    });
    if (!invitation) throw new ApiError('auth.invitation_invalid', 404);
    const { user } = invitation;
    if (
      invitation.usedAt ||
      invitation.revokedAt ||
      invitation.expiresAt <= this.clock.now() ||
      user.state !== 'pending' ||
      user.passwordHash
    )
      throw new ApiError('auth.invitation_expired', 410);
    return {
      invitation,
      user: {
        id: user.id,
        displayName: user.displayName,
        jobId: user.jobId,
        globalRole: user.userRolesUser.some((r) => r.role.globalScope),
      },
    };
  }

  /** The job ID or a contact that already belongs to an account, as the error to answer. */
  private async taken(
    db: Tx,
    body: Pick<StaffCreateRequest, 'jobId' | 'email' | 'mobile'>,
  ): Promise<ApiError | null> {
    if (await db.user.count({ where: { jobId: body.jobId } }))
      return new ApiError('user.job_id_taken', 409);
    const contacts = [{ email: body.email }, ...(body.mobile ? [{ mobile: body.mobile }] : [])];
    if (await db.user.count({ where: { OR: contacts } }))
      return new ApiError('registration.account_exists', 409);
    return null;
  }
}

/**
 * The program and the division exist; the supervisor is an active department official, never
 * the official themself, and the line above them never comes back to this official.
 */
export async function assertStaffRefs(
  tx: Tx,
  refs: ProfileRefs,
  userId: string | null,
  currentSupervisor: string | null = null,
): Promise<void> {
  if (refs.homeProgramId && !(await tx.program.count({ where: { id: refs.homeProgramId } })))
    throw invalid('homeProgramId', 'validation.option_unknown');
  if (
    refs.homeDivisionId &&
    !(await tx.location.count({ where: { id: refs.homeDivisionId, level: 'division' } }))
  )
    throw invalid('homeDivisionId', 'validation.option_unknown');
  if (!refs.supervisorUserId) return;
  if (refs.supervisorUserId === userId)
    throw invalid('supervisorUserId', 'user.supervisor_invalid');
  // an unchanged supervisor stays even when they left the department or were deactivated since
  if (userId && refs.supervisorUserId === currentSupervisor) return;
  // one supervisor change at a time, so two edits cannot close a loop between them
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('users.supervisor_user_id'))`;
  const supervisor = await tx.user.findFirst({
    where: {
      id: refs.supervisorUserId,
      kind: 'staff',
      state: 'active',
      affiliation: 'department',
    },
    select: { id: true },
  });
  if (!supervisor) throw invalid('supervisorUserId', 'user.supervisor_invalid');
  if (!userId) return;
  let next: string | null = refs.supervisorUserId;
  for (let step = 0; next && step < MAX_CHAIN; step += 1) {
    if (next === userId) throw invalid('supervisorUserId', 'user.supervisor_invalid');
    const row: { supervisorUserId: string | null } | null = await tx.user.findUnique({
      where: { id: next },
      select: { supervisorUserId: true },
    });
    next = row?.supervisorUserId ?? null;
  }
  if (next) throw invalid('supervisorUserId', 'user.supervisor_invalid');
}
