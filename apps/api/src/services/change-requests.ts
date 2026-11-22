import { uuidv7 } from '@css/shared';
import type { Locale } from '@css/shared/i18n';
import { z } from 'zod';
import {
  CONTACT_FIELDS,
  type DecisionRequest,
  EDIT_FIELD_VALUES,
  EDIT_FIELDS,
  type EditField,
  type EditRequestBatch,
  type EditRequestCreate,
  PHOTO_FIELDS,
} from '@css/shared/registration';
import { type Scope, volunteerWhere } from '../access/scope.js';
import type { AccessService } from '../access/service.js';
import type { AuditWriter } from '../audit/audit-writer.js';
import type { OtpService } from '../auth/otp.service.js';
import type { PermissionVersionService } from '../auth/permission-version.service.js';
import type { Principal } from '../auth/principal.js';
import type { SessionService } from '../auth/session.service.js';
import type { Env } from '../config/env.js';
import type { Clock } from '../core/clock.js';
import {
  buildPage,
  decodeCursor,
  keysetWhere,
  orderBy,
  type PageQuery,
  parseSort,
} from '../core/pagination.js';
import type { PrismaService, Tx } from '../core/prisma.service.js';
import { ApiError } from '../i18n/api-error.js';
import type { IdempotencyService } from '../idempotency/idempotency.service.js';
import type { AccountEvents } from '../notifications/account-events.js';
import { addressProblem } from './registration.js';
import { batchHash, checkEach, inOrder, namedRefusal } from './edit-batch.js';
import { applyField, changeView, OBJECT_FIELDS } from './registrations.js';

const EDIT = 'profile_edit';

/** The edit requests waiting for a decision in a scope: the approvers' list and its count. */
// a volunteer's requests only: an official's has no volunteer, and an empty scope filter (a
// global role's) would not keep it out
const waitingWhere = (scope: Scope) =>
  ({
    kind: EDIT,
    status: 'submitted',
    volunteerId: { not: null },
    volunteer: volunteerWhere(scope),
  }) as const;
/** A new mobile or email is refused while another account holds it. */
export async function assertContactFree(db: Tx, field: string, value: string, userId: string) {
  const taken = await db.user.count({
    where: {
      ...(field === 'mobile' ? { mobile: value } : { email: value }),
      NOT: { id: userId },
    },
  });
  if (taken) throw new ApiError('registration.account_exists', 409);
}

/** Contact-change codes one account may send per hour, across all its requests. */
const CODES_PER_ACCOUNT_HOUR = 5;
const isContact = (field: string): field is (typeof CONTACT_FIELDS)[number] =>
  (CONTACT_FIELDS as readonly string[]).includes(field);
const isPhoto = (field: string) => (PHOTO_FIELDS as readonly string[]).includes(field);
/**
 * Values an approver sees only with the field class (docs/security/RBAC.md, "Field-level
 * protection").
 */
/** Exported for the unit test that every key is an editable field. */
export const CLASS_OF: Record<string, string> = {
  nid: 'volunteer.identity',
  nid_photo: 'volunteer.identity',
  nid_photo_back: 'volunteer.identity',
  bloodGroup: 'volunteer.identity',
  dateOfBirth: 'volunteer.identity',
  bank: 'volunteer.bank',
};

type Row = Parameters<typeof changeView>[0];

const editField = z.enum(EDIT_FIELDS as [EditField, ...EditField[]]);

/** Whether an approver with these field classes may read the value of a field. */
function visible(field: string, classes: ReadonlySet<string>): boolean {
  const cls = CLASS_OF[field];
  return cls === undefined || classes.has(cls);
}

/** A profile edit as the contract shows it; a contact edit says whether its code was verified. */
function editView(row: Row, withValue: boolean) {
  return {
    ...changeView(row, withValue),
    ...(isContact(row.field) ? { contactVerified: row.status !== 'open' } : {}),
  };
}

const invalid = (code: string) =>
  new ApiError('validation.failed', 422, undefined, [{ path: 'newValue', code }]);

/**
 * Edit requests of approved volunteers: the request carries the new value; a text or object value
 * reaches the approvers at once, a new mobile or email only after a code to it, a photo after the
 * own upload; an RPM or Project Executive in scope approves the value (it applies at once) or
 * refuses it with a reason. Audit entries name the field, never the value.
 */
export class ChangeRequestsService {
  constructor(
    private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly audit: AuditWriter,
    private readonly otp: OtpService,
    private readonly access: AccessService,
    private readonly versions: PermissionVersionService,
    private readonly sessions: SessionService,
    private readonly events: AccountEvents,
    private readonly idempotency: IdempotencyService,
  ) {}

  async create(principal: Principal, body: EditRequestCreate) {
    const volunteerId = await this.ownVolunteer(principal);
    const value = isPhoto(body.field) ? null : await this.checkedValue(principal, body);
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM volunteers WHERE id = ${volunteerId}::uuid FOR UPDATE`;
      return this.createIn(tx, principal, volunteerId, body, value);
    });
    return editView(row, true);
  }

  /**
   * Several details of the own profile in one request: each is checked as its own request is, and
   * all of them are written in one transaction or none is; a refusal names the detail and never its
   * value. It runs once per Idempotency-Key: a repeat with the same body answers the requests the
   * first one made, and writes nothing.
   */
  async createMany(principal: Principal, key: string | undefined, body: EditRequestBatch) {
    const volunteerId = await this.ownVolunteer(principal);
    const values = await checkEach(body.requests, (r) =>
      isPhoto(r.field) ? Promise.resolve(null) : this.checkedValue(principal, r),
    );
    const outcome = await this.idempotency.runWithKey<{ id: string }>(
      key,
      { userId: principal.userId, deviceSessionId: principal.sessionId },
      body.requests.length,
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM volunteers WHERE id = ${volunteerId}::uuid FOR UPDATE`;
        const made: { id: string }[] = [];
        for (const [i, request] of body.requests.entries()) {
          try {
            const row = await this.createIn(tx, principal, volunteerId, request, values[i]);
            made.push({ id: row.id });
          } catch (error) {
            throw namedRefusal(request.field, error);
          }
        }
        return made;
      },
      { requestHash: batchHash(principal.userId, body) },
    );
    const ids = outcome.results.map((r) => r.id);
    const rows = await this.prisma.volunteerChangeRequest.findMany({
      where: { id: { in: ids }, userId: principal.userId },
    });
    return { replay: outcome.replay, data: inOrder(ids, rows).map((row) => editView(row, true)) };
  }

  /** The approved volunteer record of the caller; 404 for anyone else. */
  private async ownVolunteer(principal: Principal): Promise<string> {
    const volunteer = await this.prisma.volunteer.findFirst({
      where: { userId: principal.userId, approvedAt: { not: null } },
      select: { id: true },
    });
    if (!volunteer) throw new ApiError('permission.not_found', 404);
    return volunteer.id;
  }

  /** One edit request written inside the caller's transaction, under the volunteer's lock. */
  private async createIn(
    tx: Tx,
    principal: Principal,
    volunteerId: string,
    body: EditRequestCreate,
    value: unknown,
  ) {
    // a contact still waiting for its code, or a photo for its upload, is replaced (a mistyped
    // number or a failed upload would else block the field)
    if (isContact(body.field) || isPhoto(body.field))
      await tx.volunteerChangeRequest.updateMany({
        where: { volunteerId, kind: EDIT, field: body.field, status: 'open' },
        data: { status: 'closed', decidedAt: this.clock.now() },
      });
    const busy = await tx.volunteerChangeRequest.count({
      where: {
        volunteerId,
        kind: EDIT,
        field: body.field,
        status: { in: ['open', 'submitted'] },
      },
    });
    if (busy) throw new ApiError('registration.request_open', 409);
    const created = await tx.volunteerChangeRequest.create({
      data: {
        id: uuidv7(),
        userId: principal.userId,
        volunteerId,
        kind: EDIT,
        field: body.field,
        newValue: value === null ? null : typeof value === 'string' ? value : JSON.stringify(value),
        note: body.note ?? null,
        requestedBy: principal.userId,
        // a contact waits for its code, a photo for its upload
        status: isContact(body.field) || isPhoto(body.field) ? 'open' : 'submitted',
      },
    });
    await this.audit.record(tx, {
      action: 'auth.edit_requested',
      entityType: 'user',
      entityId: principal.userId,
      new: { field: body.field, requestId: created.id },
    });
    // a contact waits for its code and a photo for its upload before the approvers are told
    if (created.status === 'submitted') await this.events.editRequestSubmitted(tx, created.id);
    return created;
  }

  /**
   * The value of a non-photo field, checked by its field. Whether a new contact is free is told
   * only after its code is verified (verifyCode), so nobody learns whose number or address it is
   * without owning it.
   */
  private async checkedValue(principal: Principal, body: EditRequestCreate): Promise<unknown> {
    const parsed = EDIT_FIELD_VALUES[body.field].safeParse(body.newValue);
    if (!parsed.success) throw invalid(parsed.error.issues[0]?.message ?? 'validation.failed');
    const value = parsed.data as unknown;
    if (body.field === 'address' || body.field === 'permanentAddress') {
      const problem = await addressProblem(
        this.prisma,
        value as Parameters<typeof addressProblem>[1],
      );
      if (problem) throw invalid('validation.option_unknown');
    }
    if (isContact(body.field)) {
      const current = await this.prisma.user.findUniqueOrThrow({
        where: { id: principal.userId },
        select: { mobile: true, email: true },
      });
      if (current[body.field] === value) throw invalid('validation.option_unknown');
    }
    return value;
  }

  /**
   * An own contact edit that still waits for its code, a volunteer's or an official's; 404 for
   * anyone else's (no leak).
   */
  private async ownOpenContact(principal: Principal, requestId: string) {
    const row = await this.prisma.volunteerChangeRequest.findFirst({
      where: {
        id: requestId,
        kind: EDIT,
        field: { in: [...CONTACT_FIELDS] },
        userId: principal.userId,
      },
    });
    if (!row || !row.newValue) throw new ApiError('permission.not_found', 404);
    if (row.status !== 'open') throw new ApiError('user.transition_not_allowed', 409);
    return { ...row, newValue: row.newValue };
  }

  /** Sends a code to the new mobile or email. */
  async sendCode(principal: Principal, requestId: string, locale: Locale): Promise<void> {
    const row = await this.ownOpenContact(principal, requestId);
    // one account, whatever the request: a new request must not give a fresh budget of codes
    const recent = await this.prisma.otpCode.count({
      where: {
        purpose: 'contact_change',
        createdBy: principal.userId,
        createdAt: { gt: new Date(this.clock.now().getTime() - 3_600_000) },
      },
    });
    if (recent >= CODES_PER_ACCOUNT_HOUR) throw new ApiError('rate_limit.exceeded', 429);
    const channel = row.field === 'mobile' ? 'sms' : 'email';
    await this.otp.issue(
      { purpose: 'contact_change', channel, address: row.newValue },
      { locale, templateKey: 'otp_contact_change', createdBy: principal.userId },
    );
    await this.prisma.$transaction((tx) =>
      this.audit.record(tx, {
        action: 'auth.otp_sent',
        entityType: 'user',
        entityId: principal.userId,
        new: { purpose: 'contact_change', channel, requestId: row.id },
      }),
    );
  }

  /** Verifies the code of the new contact; only then does the request reach the approvers. */
  async verifyCode(principal: Principal, requestId: string, code: string): Promise<void> {
    const row = await this.ownOpenContact(principal, requestId);
    let otpId: string;
    try {
      otpId = await this.otp.check({ purpose: 'contact_change', address: row.newValue }, code);
    } catch (error) {
      await this.prisma.$transaction((tx) =>
        this.audit.record(tx, {
          action: 'auth.otp_failed',
          entityType: 'user',
          entityId: principal.userId,
          new: { purpose: 'contact_change', requestId: row.id },
        }),
      );
      throw error;
    }
    await this.prisma.$transaction(async (tx) => {
      if (!(await this.otp.consume(tx, otpId))) throw new ApiError('otp.invalid', 422);
      // the caller now owns the new contact: only now may the answer say it is taken
      await assertContactFree(tx, row.field, row.newValue, principal.userId);
      const moved = await tx.volunteerChangeRequest.updateMany({
        where: { id: row.id, status: 'open' },
        data: { status: 'submitted' },
      });
      if (!moved.count) throw new ApiError('user.transition_not_allowed', 409);
      await this.events.editRequestSubmitted(tx, row.id);
      await this.audit.record(tx, {
        action: 'auth.otp_verified',
        entityType: 'user',
        entityId: principal.userId,
        new: { purpose: 'contact_change', requestId: row.id },
      });
    });
  }

  /** Edit requests waiting for a decision, of the volunteers in the approver's scope. */
  async list(
    query: Omit<PageQuery, 'sort'>,
    actor: Principal,
    scope: Scope,
    classes: ReadonlySet<string>,
  ) {
    const sort = parseSort(
      undefined,
      ['createdAt', 'id'],
      [{ field: 'createdAt', direction: 'asc' }],
    );
    const binding = `edit-requests.list|${actor.userId}`;
    const cursor = query.cursor
      ? decodeCursor(this.env.CURSOR_SECRET, binding, query.cursor)
      : undefined;
    const direction = cursor?.d ?? 'next';
    const filter = waitingWhere(scope);
    const fetched = await this.prisma.volunteerChangeRequest.findMany({
      where: cursor ? { AND: [filter, keysetWhere(sort, cursor)] } : filter,
      orderBy: orderBy(sort, direction),
      take: query.limit + 1,
      include: { user: { select: { displayName: true } } },
    });
    const { rows, meta } = buildPage(fetched, {
      limit: query.limit,
      sort,
      direction,
      hadCursor: Boolean(cursor),
      secret: this.env.CURSOR_SECRET,
      binding,
    });
    return {
      // the approver sees who asked
      rows: rows.map((r) => ({
        ...editView(r, visible(r.field, classes)),
        volunteerName: r.user.displayName,
      })),
      meta,
    };
  }

  /** How many edit requests wait for a decision in the scope (the My Work home). */
  waitingCount(scope: Scope): Promise<number> {
    return this.prisma.volunteerChangeRequest.count({ where: waitingWhere(scope) });
  }

  /** Approves (the value applies at once) or refuses with a reason an edit request in scope. */
  async decide(
    actor: Principal,
    scope: Scope,
    requestId: string,
    body: DecisionRequest,
    classes: ReadonlySet<string>,
  ) {
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM volunteer_change_requests WHERE id = ${requestId}::uuid FOR UPDATE`;
      const found = await tx.volunteerChangeRequest.findFirst({
        where: {
          id: requestId,
          kind: EDIT,
          volunteerId: { not: null },
          volunteer: volunteerWhere(scope),
        },
      });
      // a request with no volunteer is an official's, which this volunteer path never decides
      if (!found?.volunteerId) {
        this.access.denied(actor.userId, scope.permission, scope.entity);
        throw new ApiError('permission.not_found', 404);
      }
      if (found.status !== 'submitted') throw new ApiError('user.transition_not_allowed', 409);
      const owner = found.userId;
      const field = editField.parse(found.field);
      if (body.decision === 'approve')
        await this.apply(tx, owner, found.volunteerId, field, found.newValue);
      const saved = await tx.volunteerChangeRequest.update({
        where: { id: found.id },
        data: {
          status: body.decision === 'approve' ? 'approved' : 'rejected',
          decidedBy: actor.userId,
          decidedAt: this.clock.now(),
        },
      });
      const entry = {
        action: 'auth.edit_request_decided',
        new: { field, decision: body.decision, requestId: found.id },
        reason: body.reason ?? null,
      };
      // a new contact ends every session and changes the login id: the version moves on
      if (body.decision === 'approve' && isContact(field)) {
        await this.sessions.revokeAll(tx, owner, { by: actor.userId, reason: 'contact_changed' });
        await this.versions.bump(tx, owner, entry);
      } else await this.audit.record(tx, { ...entry, entityType: 'user', entityId: owner });
      await this.events.editRequestDecided(
        tx,
        found.id,
        owner,
        field,
        body.decision === 'approve',
        actor.userId,
      );
      return saved;
    });
    return editView(row, visible(row.field, classes));
  }

  private async apply(
    tx: Tx,
    userId: string,
    volunteerId: string,
    field: EditField,
    stored: string | null,
  ) {
    if (stored === null) throw new ApiError('user.transition_not_allowed', 409);
    if (isContact(field)) {
      await assertContactFree(tx, field, stored, userId);
      await tx.user.update({
        where: { id: userId },
        data: field === 'mobile' ? { mobile: stored } : { email: stored },
      });
      return;
    }
    // validated at the request; parsed again at the boundary instead of trusted
    const value: unknown = EDIT_FIELD_VALUES[field].parse(
      OBJECT_FIELDS.has(field) ? JSON.parse(stored) : stored,
    );
    if (field === 'nid') {
      const taken = await tx.volunteer.count({ where: { nid: stored, NOT: { id: volunteerId } } });
      if (taken) throw new ApiError('registration.nid_exists', 409);
    }
    await applyField(tx, userId, volunteerId, field, value);
  }
}
