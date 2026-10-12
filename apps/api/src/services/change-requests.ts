import { uuidv7 } from '@css/shared';
import type { Locale } from '@css/shared/i18n';
import {
  CONTACT_FIELDS,
  type DecisionRequest,
  EDIT_FIELD_VALUES,
  type EditField,
  type EditRequestCreate,
  PHOTO_FIELDS,
} from '@css/shared/registration';
import { type Scope, volunteerWhere } from '../access/scope';
import type { AccessService } from '../access/service';
import type { AuditWriter } from '../audit/audit-writer';
import type { OtpService } from '../auth/otp.service';
import type { PermissionVersionService } from '../auth/permission-version.service';
import type { Principal } from '../auth/principal';
import type { SessionService } from '../auth/session.service';
import type { Env } from '../config/env';
import type { Clock } from '../core/clock';
import {
  buildPage,
  decodeCursor,
  keysetWhere,
  orderBy,
  type PageQuery,
  parseSort,
} from '../core/pagination';
import type { PrismaService, Tx } from '../core/prisma.service';
import { ApiError } from '../i18n/api-error';
import type { RegistrationEvents } from '../notifications/registration-events';
import { addressProblem } from './registration';
import { applyField, changeView } from './registrations';

const EDIT = 'profile_edit';
const isContact = (field: string): field is (typeof CONTACT_FIELDS)[number] =>
  (CONTACT_FIELDS as readonly string[]).includes(field);
const isPhoto = (field: string) => (PHOTO_FIELDS as readonly string[]).includes(field);
/** Values an approver sees only with the field class (RBAC.md 6). */
const CLASS_OF: Record<string, string> = {
  nid: 'volunteer.identity',
  nid_photo: 'volunteer.identity',
  bank: 'volunteer.bank',
};

type Row = Parameters<typeof changeView>[0];

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
 * Edit requests of approved volunteers (BR-031 as amended by DECISION_LOG D-085; plan
 * docs/plans/2026-10-12-1541-feat-registration-approval-handover-plan.md, R10, R18): the request
 * carries the new value; a text or object value reaches the approvers at once, a new mobile or
 * email only after a code to it, a photo after the own upload; an RPM or Project Executive in
 * scope approves the value (it applies at once) or refuses it with a reason. Audit entries name
 * the field, never the value.
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
    private readonly events: RegistrationEvents,
  ) {}

  async create(principal: Principal, body: EditRequestCreate) {
    const volunteer = await this.prisma.volunteer.findFirst({
      where: { userId: principal.userId, approvedAt: { not: null } },
      select: { id: true },
    });
    if (!volunteer) throw new ApiError('permission.not_found', 404);
    const value = isPhoto(body.field) ? null : await this.checkedValue(principal, body);
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM volunteers WHERE id = ${volunteer.id}::uuid FOR UPDATE`;
      const busy = await tx.volunteerChangeRequest.count({
        where: {
          volunteerId: volunteer.id,
          kind: EDIT,
          field: body.field,
          status: { in: ['open', 'submitted'] },
        },
      });
      if (busy) throw new ApiError('registration.request_open', 409);
      const created = await tx.volunteerChangeRequest.create({
        data: {
          id: uuidv7(),
          volunteerId: volunteer.id,
          kind: EDIT,
          field: body.field,
          newValue:
            value === null ? null : typeof value === 'string' ? value : JSON.stringify(value),
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
      return created;
    });
    this.events.emit({ type: 'registration.edit_requested', userId: principal.userId });
    return editView(row, true);
  }

  /** The value of a non-photo field, checked by its field; a new contact must be free. */
  private async checkedValue(principal: Principal, body: EditRequestCreate): Promise<unknown> {
    const parsed = EDIT_FIELD_VALUES[body.field].safeParse(body.newValue);
    if (!parsed.success) throw invalid(parsed.error.issues[0]?.message ?? 'validation.failed');
    const value = parsed.data as unknown;
    if (body.field === 'address') {
      const problem = await addressProblem(
        this.prisma,
        value as Parameters<typeof addressProblem>[1],
      );
      if (problem) throw invalid('validation.option_unknown');
    }
    if (isContact(body.field))
      await this.assertContactFree(this.prisma, body.field, value as string, principal.userId);
    return value;
  }

  private async assertContactFree(db: Tx, field: string, value: string, userId: string) {
    const taken = await db.user.count({
      where: {
        ...(field === 'mobile' ? { mobile: value } : { email: value }),
        NOT: { id: userId },
      },
    });
    if (taken) throw new ApiError('registration.account_exists', 409);
  }

  /** An own contact edit that still waits for its code; 404 for anyone else's (no leak). */
  private async ownOpenContact(principal: Principal, requestId: string) {
    const row = await this.prisma.volunteerChangeRequest.findFirst({
      where: {
        id: requestId,
        kind: EDIT,
        field: { in: [...CONTACT_FIELDS] },
        volunteer: { userId: principal.userId },
      },
    });
    if (!row || !row.newValue) throw new ApiError('permission.not_found', 404);
    if (row.status !== 'open') throw new ApiError('user.transition_not_allowed', 409);
    return { ...row, newValue: row.newValue };
  }

  /** Sends a code to the new mobile or email (D-085). */
  async sendCode(principal: Principal, requestId: string, locale: Locale): Promise<void> {
    const row = await this.ownOpenContact(principal, requestId);
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
      const moved = await tx.volunteerChangeRequest.updateMany({
        where: { id: row.id, status: 'open' },
        data: { status: 'submitted' },
      });
      if (!moved.count) throw new ApiError('user.transition_not_allowed', 409);
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
    const filter = { kind: EDIT, status: 'submitted', volunteer: volunteerWhere(scope) };
    const fetched = await this.prisma.volunteerChangeRequest.findMany({
      where: cursor ? { AND: [filter, keysetWhere(sort, cursor)] } : filter,
      orderBy: orderBy(sort, direction),
      take: query.limit + 1,
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
      rows: rows.map((r) => {
        const cls = CLASS_OF[r.field];
        return editView(r, cls === undefined || classes.has(cls));
      }),
      meta,
    };
  }

  /** Approves (the value applies at once) or refuses with a reason an edit request in scope. */
  async decide(actor: Principal, scope: Scope, requestId: string, body: DecisionRequest) {
    const { row, userId } = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM volunteer_change_requests WHERE id = ${requestId}::uuid FOR UPDATE`;
      const found = await tx.volunteerChangeRequest.findFirst({
        where: { id: requestId, kind: EDIT, volunteer: volunteerWhere(scope) },
        include: { volunteer: { select: { userId: true } } },
      });
      if (!found) {
        this.access.denied(actor.userId, scope.permission, scope.entity);
        throw new ApiError('permission.not_found', 404);
      }
      if (found.status !== 'submitted') throw new ApiError('user.transition_not_allowed', 409);
      const owner = found.volunteer.userId;
      const field = found.field as EditField;
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
      return { row: saved, userId: owner };
    });
    this.events.emit({ type: 'registration.edit_decided', userId });
    return editView(row, true);
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
      await this.assertContactFree(tx, field, stored, userId);
      await tx.user.update({
        where: { id: userId },
        data: field === 'mobile' ? { mobile: stored } : { email: stored },
      });
      return;
    }
    const value =
      field === 'address' || field === 'bank' ? (JSON.parse(stored) as unknown) : stored;
    if (field === 'nid') {
      const taken = await tx.volunteer.count({ where: { nid: stored, NOT: { id: volunteerId } } });
      if (taken) throw new ApiError('registration.nid_exists', 409);
    }
    await applyField(tx, userId, volunteerId, field, value);
  }
}
