import { uuidv7 } from '@css/shared';
import {
  CONTACT_FIELDS,
  type DecisionRequest,
  STAFF_EDIT_FIELD_VALUES,
  STAFF_EDIT_FIELDS,
  type StaffEditField,
  type StaffEditRequestBatch,
  type StaffEditRequestCreate,
  type StaffValueField,
} from '@css/shared/registration';
import type { AuditWriter } from '../audit/audit-writer.js';
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
import { assertContactFree } from './change-requests.js';
import { inOrder, runEditBatch } from './edit-batch.js';
import { changeView } from './registrations.js';
import { assertStaffRefs } from './staff-accounts.js';
import { linkStaffPhoto, staffPhotos } from './staff-photos.js';

const EDIT = 'profile_edit';
/** An official's request has no volunteer; the volunteer path never reaches it. */
const WAITING = { kind: EDIT, status: 'submitted', volunteerId: null } as const;
/** The references whose ids the deciders see with their names. */
const REFERENCES = ['homeProgramId'] as const;
type Reference = (typeof REFERENCES)[number];

/** The reference a request names, to be checked; the supervisor is not asked for here. */
const refs = (field: Reference, value: unknown) =>
  ({ supervisorUserId: null, [field]: value }) as Parameters<typeof assertStaffRefs>[1];

const isContact = (field: string): field is (typeof CONTACT_FIELDS)[number] =>
  (CONTACT_FIELDS as readonly string[]).includes(field);
const isReference = (field: string): field is Reference =>
  (REFERENCES as readonly string[]).includes(field);
/** A move to another program changes what the official's scope reaches. */
const MOVES_SCOPE = new Set<string>(['homeProgramId']);

const invalid = (code: string) =>
  new ApiError('validation.failed', 422, undefined, [{ path: 'newValue', code }]);

/** The value as stored: an object or a reference as JSON text, a text as it is. */
const stored = (field: StaffValueField, value: unknown) =>
  typeof value === 'string' && !isReference(field) ? value : JSON.stringify(value);
const restored = (field: StaffValueField, text: string): unknown =>
  STAFF_EDIT_FIELD_VALUES[field].parse(
    field === 'workplace' || isReference(field) ? JSON.parse(text) : text,
  );

const PERSON = {
  displayName: true,
  designation: true,
  mobile: true,
  email: true,
  affiliation: true,
  affiliationUnit: true,
  homeProgramId: true,
  supervisorUserId: true,
} as const;
type Person = {
  displayName: string;
  designation: string | null;
  mobile: string | null;
  email: string | null;
  affiliation: string | null;
  affiliationUnit: string | null;
  homeProgramId: string | null;
  supervisorUserId: string | null;
};

/**
 * The person's value of a field now, in the shape a request carries. A waiting request for a
 * detail that is not asked for (a supervisor, an area of the account) has no value to show.
 */
function currentValue(person: Person, field: StaffEditField, photo: string | null): unknown {
  switch (field) {
    case 'workplace':
      return { affiliation: person.affiliation, affiliationUnit: person.affiliationUnit };
    case 'photo':
      return photo;
    default:
      return person[field] ?? null;
  }
}

/** A request as the contract shows it; a contact request says whether its code was verified. */
const view = (row: Parameters<typeof changeView>[0]) => ({
  ...changeView(row, true),
  ...(isContact(row.field) ? { contactVerified: row.status !== 'open' } : {}),
});

/**
 * An official's requests to change their own details (docs/DECISION_LOG.md, the official's own
 * profile of 2026-11-02; docs/BUSINESS_RULES.md, "An official asks for a change"): kept in the
 * change-request table without a volunteer, a new mobile or email first verified by its code, a
 * photo by the own upload; the Department Head or the Monitoring Team decides, never the person
 * who asked. An approval writes the change at once.
 */
export class StaffChangeRequestsService {
  constructor(
    private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly audit: AuditWriter,
    private readonly versions: PermissionVersionService,
    private readonly sessions: SessionService,
    private readonly events: AccountEvents,
    private readonly idempotency: IdempotencyService,
  ) {}

  async create(principal: Principal, body: StaffEditRequestCreate) {
    if (principal.kind !== 'staff') throw new ApiError('permission.not_found', 404);
    const row = await this.prisma.$transaction(async (tx) => {
      await this.lockPerson(tx, principal.userId);
      const value =
        body.field === 'photo'
          ? null
          : await this.checkedValue(tx, principal.userId, { ...body, field: body.field });
      return this.createIn(tx, principal, body, value);
    });
    return view(row);
  }

  /**
   * Several details of the own profile in one request: each is checked as its own request is, and
   * all of them are written in one transaction or none is; a refusal names the detail and never its
   * value. It runs once per Idempotency-Key: a repeat with the same body answers the requests the
   * first one made, and writes nothing.
   */
  async createMany(principal: Principal, key: string | undefined, body: StaffEditRequestBatch) {
    if (principal.kind !== 'staff') throw new ApiError('permission.not_found', 404);
    const { replay, ids } = await runEditBatch(this.idempotency, key, principal, body.requests, {
      lock: (tx) => this.lockPerson(tx, principal.userId),
      check: (tx, r) =>
        r.field === 'photo'
          ? Promise.resolve(null)
          : this.checkedValue(tx, principal.userId, { ...r, field: r.field }),
      write: (tx, r, value) => this.createIn(tx, principal, r, value),
    });
    const rows = await this.prisma.volunteerChangeRequest.findMany({
      where: { id: { in: ids }, userId: principal.userId, volunteerId: null },
    });
    return { replay, data: inOrder(ids, rows).map(view) };
  }

  /** The caller's own row, locked for the requests; 404 when it is gone. */
  private async lockPerson(tx: Tx, userId: string): Promise<void> {
    const [person] = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
    if (!person) throw new ApiError('permission.not_found', 404);
  }

  /** One edit request of an official written inside the caller's transaction, under the lock. */
  private async createIn(
    tx: Tx,
    principal: Principal,
    body: StaffEditRequestCreate,
    value: unknown,
  ) {
    const field = body.field;
    // a contact still waiting for its code, or a photo for its upload, is replaced (a mistyped
    // number or a failed upload would else block the field)
    if (isContact(field) || field === 'photo')
      await tx.volunteerChangeRequest.updateMany({
        where: { userId: principal.userId, volunteerId: null, kind: EDIT, field, status: 'open' },
        data: { status: 'closed', decidedAt: this.clock.now() },
      });
    const busy = await tx.volunteerChangeRequest.count({
      where: {
        userId: principal.userId,
        volunteerId: null,
        kind: EDIT,
        field,
        status: { in: ['open', 'submitted'] },
      },
    });
    if (busy) throw new ApiError('registration.request_open', 409);
    const created = await tx.volunteerChangeRequest.create({
      data: {
        id: uuidv7(),
        userId: principal.userId,
        volunteerId: null,
        kind: EDIT,
        field,
        newValue: field === 'photo' ? null : stored(field, value),
        note: body.note ?? null,
        requestedBy: principal.userId,
        // a contact waits for its code, a photo for its upload
        status: isContact(field) || field === 'photo' ? 'open' : 'submitted',
      },
    });
    await this.audit.record(tx, {
      action: 'auth.edit_requested',
      entityType: 'user',
      entityId: principal.userId,
      new: { field, requestId: created.id },
    });
    if (created.status === 'submitted') await this.events.editRequestSubmitted(tx, created.id);
    return created;
  }

  /**
   * The value checked by its field: a contact other than the own one (whether it is free is told
   * only after its code), a program or division that exists, and never the value the person
   * already has.
   */
  private async checkedValue(
    tx: Tx,
    userId: string,
    body: StaffEditRequestCreate & { field: StaffValueField },
  ): Promise<unknown> {
    const parsed = STAFF_EDIT_FIELD_VALUES[body.field].safeParse(body.newValue);
    if (!parsed.success) throw invalid(parsed.error.issues[0]?.message ?? 'validation.failed');
    const value = parsed.data as unknown;
    const person = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: PERSON });
    if (JSON.stringify(currentValue(person, body.field, null)) === JSON.stringify(value))
      throw invalid('validation.option_unknown');
    if (isReference(body.field))
      await assertStaffRefs(tx, refs(body.field, value), userId, person.supervisorUserId);
    return value;
  }

  /** The officials' requests waiting for a decision, with each person's current value. */
  async list(query: Omit<PageQuery, 'sort'>, actor: Principal) {
    const sort = parseSort(
      undefined,
      ['createdAt', 'id'],
      [{ field: 'createdAt', direction: 'asc' }],
    );
    const binding = `staff-edit-requests.list|${actor.userId}`;
    const cursor = query.cursor
      ? decodeCursor(this.env.CURSOR_SECRET, binding, query.cursor)
      : undefined;
    const direction = cursor?.d ?? 'next';
    const fetched = await this.prisma.volunteerChangeRequest.findMany({
      where: cursor ? { AND: [WAITING, keysetWhere(sort, cursor)] } : WAITING,
      orderBy: orderBy(sort, direction),
      take: query.limit + 1,
      include: { user: { select: { ...PERSON, jobId: true } } },
    });
    const { rows, meta } = buildPage(fetched, {
      limit: query.limit,
      sort,
      direction,
      hadCursor: Boolean(cursor),
      secret: this.env.CURSOR_SECRET,
      binding,
    });
    const photos = await staffPhotos(this.prisma, [...new Set(rows.map((r) => r.userId))]);
    const views = rows.map((r) => {
      const field = r.field as StaffEditField;
      return {
        ...view(r),
        personName: r.user.displayName,
        personJobId: r.user.jobId,
        currentValue: currentValue(r.user, field, photos.get(r.userId) ?? null),
      };
    });
    return { rows: await this.withNames(views), meta };
  }

  /** The names of the programs the rows name, by id. */
  private async withNames<T extends { field: string; newValue?: unknown; currentValue: unknown }>(
    rows: T[],
  ): Promise<(T & { names: Record<string, { bn: string; en: string }> })[]> {
    const ids = (field: Reference) => [
      ...new Set(
        rows
          .filter((r) => r.field === field)
          .flatMap((r) => [r.newValue, r.currentValue])
          .filter((v): v is string => typeof v === 'string'),
      ),
    ];
    const programs = await this.prisma.program.findMany({
      where: { id: { in: ids('homeProgramId') } },
      select: { id: true, nameBn: true, nameEn: true },
    });
    const names = new Map<string, { bn: string; en: string }>(
      programs.map((p) => [p.id, { bn: p.nameBn, en: p.nameEn }] as const),
    );
    return rows.map((r) => ({
      ...r,
      names: Object.fromEntries(
        [r.newValue, r.currentValue]
          .filter((v): v is string => typeof v === 'string' && names.has(v))
          .map((id) => [id, names.get(id)!]),
      ),
    }));
  }

  /**
   * What an official picks from when they ask for another program: every active program by name,
   * since their own program scope may not hold the one they move to (the division comes from the
   * public location list).
   */
  async choices(principal: Principal) {
    if (principal.kind !== 'staff') throw new ApiError('permission.not_found', 404);
    const programs = await this.prisma.program.findMany({
      where: { active: true },
      select: { id: true, nameBn: true, nameEn: true },
      orderBy: { code: 'asc' },
    });
    return { programs: programs.map((p) => ({ id: p.id, name: { bn: p.nameBn, en: p.nameEn } })) };
  }

  /** How many officials' requests wait for a decision (the deciders' My Work home). */
  waitingCount(): Promise<number> {
    return this.prisma.volunteerChangeRequest.count({ where: WAITING });
  }

  /**
   * Approves (the change applies at once) or refuses with a reason an official's request; the
   * person who asked never decides it.
   */
  async decide(actor: Principal, requestId: string, body: DecisionRequest) {
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM volunteer_change_requests WHERE id = ${requestId}::uuid FOR UPDATE`;
      const found = await tx.volunteerChangeRequest.findFirst({
        where: { id: requestId, kind: EDIT, volunteerId: null },
      });
      if (!found) throw new ApiError('permission.not_found', 404);
      if (found.userId === actor.userId) throw new ApiError('permission.denied', 403);
      if (found.status !== 'submitted') throw new ApiError('user.transition_not_allowed', 409);
      const owner = found.userId;
      const field = found.field as StaffEditField;
      const approve = body.decision === 'approve';
      // a request for a detail no longer asked for (a supervisor, before that was taken out) can
      // only be refused
      if (approve && !(STAFF_EDIT_FIELDS as readonly string[]).includes(field))
        throw new ApiError('user.transition_not_allowed', 409);
      if (approve) await this.apply(tx, actor.userId, owner, field, found.newValue);
      const saved = await tx.volunteerChangeRequest.update({
        where: { id: found.id },
        data: {
          status: approve ? 'approved' : 'rejected',
          decidedBy: actor.userId,
          decidedAt: this.clock.now(),
        },
      });
      const entry = {
        action: 'auth.edit_request_decided',
        new: { field, decision: body.decision, requestId: found.id },
        reason: body.reason ?? null,
      };
      // a new contact ends every session; a new program or division changes the scope
      if (approve && isContact(field))
        await this.sessions.revokeAll(tx, owner, { by: actor.userId, reason: 'contact_changed' });
      if (approve && (isContact(field) || MOVES_SCOPE.has(field)))
        await this.versions.bump(tx, owner, entry);
      else await this.audit.record(tx, { ...entry, entityType: 'user', entityId: owner });
      await this.events.editRequestDecided(tx, found.id, owner, field, approve, actor.userId);
      return saved;
    });
    return view(row);
  }

  private async apply(
    tx: Tx,
    actorId: string,
    userId: string,
    field: StaffEditField,
    text: string | null,
  ) {
    if (text === null) throw new ApiError('user.transition_not_allowed', 409);
    if (field === 'photo') return linkStaffPhoto(tx, userId, text);
    // validated at the request; parsed again at the boundary instead of trusted
    const value = restored(field, text);
    if (isContact(field)) await assertContactFree(tx, field, value as string, userId);
    if (isReference(field)) {
      const person = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: { supervisorUserId: true },
      });
      // the program or the division may have changed since the request
      await assertStaffRefs(tx, refs(field, value), userId, person.supervisorUserId);
    }
    await tx.user.update({
      where: { id: userId },
      data: {
        ...(field === 'workplace' ? (value as object) : { [field]: value }),
        updatedBy: actorId,
      },
    });
  }
}
