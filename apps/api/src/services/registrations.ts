import { uuidv7 } from '@css/shared';
import {
  PHOTO_SLOTS,
  type ChangeRequestAnswer,
  CORRECTION_FIELD_VALUES,
  type CorrectionField,
  type RegistrationCorrectionCreate,
  type StaffDecision,
} from '@css/shared/registration';
import { type HardRule, madeByRoleChange, roleRefusal } from '../access/hard-rules.js';
import type { AccessRegistry } from '../access/registry.js';
import { type Scope, volunteerWhere } from '../access/scope.js';
import type { AccessService } from '../access/service.js';
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
import type { Prisma } from '../generated/prisma/client.js';
import { ApiError } from '../i18n/api-error.js';
import type { AccountEvents } from '../notifications/account-events.js';
import { addressProblem } from './registration.js';
import { DETAILS_SELECT, detailsUpdate, detailsView } from './volunteer-details.js';

export type RegistrationStatus = 'awaiting_review' | 'in_correction';

export interface RegistrationListQuery extends Omit<PageQuery, 'sort'> {
  kind?: 'volunteer' | 'staff';
  status?: RegistrationStatus;
  districtId?: string;
}

export const CORRECTION = 'registration_correction';
/** Correction rows that keep a registration away from the approvers. */
export const UNFINISHED = ['open', 'submitted'];
/** Refused correction answers (invalid value, NID of another volunteer) an account allows per hour. */
const MAX_REFUSED_ANSWERS = 10;
const REFUSAL_WINDOW_MS = 3_600_000;
/**
 * An official role that a staff decision or the admin's new account may give: an Admin and the
 * Department Head are made by an Admin through a role change (docs/security/RBAC.md, "Roles").
 */
export function isGivableOfficialRole(registry: AccessRegistry, roleKey: string): boolean {
  const role = registry.roles.get(roleKey);
  return Boolean(role && role.kind === 'official' && !madeByRoleChange(role.key));
}

/**
 * Answers a role the actor may not give (docs/security/RBAC.md, "Roles": the Monitoring Team is
 * given by an Admin or the Department Head): the refusal is audited on `entityId` in a transaction
 * of its own, then answered 403 with the rule.
 */
export async function refuseRole(
  deps: { prisma: PrismaService; audit: AuditWriter },
  rule: HardRule,
  roleKey: string,
  entityId: string,
): Promise<never> {
  await deps.prisma.$transaction((tx) =>
    deps.audit.record(tx, {
      action: 'permission_change_refused',
      entityType: 'user',
      entityId,
      new: { role: roleKey, rule },
    }),
  );
  throw new ApiError('permission.grant_refused', 403, { rule });
}

/**
 * A staff registration is an account the person registered themselves; an account the admin
 * created waits for its set-password link and is never a registration to decide.
 */
const SELF_REGISTERED: Prisma.UserWhereInput = { accountInvitationsUser: { none: {} } };

const pendingSelect = {
  id: true,
  kind: true,
  displayName: true,
  designation: true,
  createdAt: true,
  registrationDraftsSubmittedUser: {
    orderBy: { submittedAt: 'desc' },
    take: 1,
    select: { submittedAt: true },
  },
  volunteersUser: {
    select: {
      type: true,
      divisionId: true,
      districtId: true,
      _count: {
        select: {
          volunteerChangeRequestsVolunteer: {
            where: { kind: CORRECTION, status: { in: UNFINISHED } },
          },
        },
      },
    },
  },
} satisfies Prisma.UserSelect;

type PendingRow = Prisma.UserGetPayload<{ select: typeof pendingSelect }>;

function pendingView(u: PendingRow) {
  const v = u.volunteersUser;
  return {
    userId: u.id,
    kind: u.kind as 'volunteer' | 'staff',
    displayName: u.displayName,
    status: (v && v._count.volunteerChangeRequestsVolunteer > 0
      ? 'in_correction'
      : 'awaiting_review') as RegistrationStatus,
    submittedAt: (u.registrationDraftsSubmittedUser[0]?.submittedAt ?? u.createdAt).toISOString(),
    volunteerType: v?.type ?? null,
    divisionId: v?.divisionId ?? null,
    districtId: v?.districtId ?? null,
    designation: u.designation,
  };
}

type ChangeRow = {
  id: string;
  userId: string;
  volunteerId: string | null;
  kind: string;
  field: string;
  newValue: string | null;
  note: string | null;
  status: string;
  decidedAt: Date | null;
};

/** A change request as the contract shows it; the value only where the caller may read it. */
export function changeView(row: ChangeRow, withValue: boolean) {
  return {
    id: row.id,
    userId: row.userId,
    volunteerId: row.volunteerId,
    kind: row.kind,
    field: row.field,
    ...(withValue && row.newValue !== null
      ? { newValue: storedValue(row.field, row.newValue) }
      : {}),
    note: row.note,
    status: row.status,
    decidedAt: row.decidedAt?.toISOString() ?? null,
  };
}

/**
 * The address, the bank details and the other objects of a volunteer, and an official's workplace
 * and references (a reference may be null), are stored as JSON text; every other field as the text.
 */
export const OBJECT_FIELDS = new Set([
  'address',
  'bank',
  'profession',
  'skills',
  'educationDetails',
  'permanentAddress',
  'workplace',
  'homeProgramId',
  'homeDivisionId',
  'supervisorUserId',
]);
function storedValue(field: string, text: string): unknown {
  if (!OBJECT_FIELDS.has(field)) return text;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

/**
 * Approval, rejection and correction of registrations: pending volunteers are reached by their
 * address in the approver's scope (`volunteerWhere`); pending officials only by the holders of
 * `staff.registration.approve`. Every action is audited and calls the notification hook.
 */
export class RegistrationsService {
  constructor(
    private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly audit: AuditWriter,
    private readonly access: AccessService,
    private readonly registry: AccessRegistry,
    private readonly versions: PermissionVersionService,
    private readonly sessions: SessionService,
    private readonly events: AccountEvents,
  ) {}

  /** Whether the caller decides staff registrations (a GLOBAL grant of the staff permission). */
  private async decidesStaff(userId: string): Promise<boolean> {
    const access = await this.access.load(userId);
    return access.grants.some((g) => g.permission === 'staff.registration.approve');
  }

  private pendingWhere(
    scope: Scope,
    staff: boolean,
    query: Pick<RegistrationListQuery, 'kind' | 'status' | 'districtId'>,
  ): Prisma.UserWhereInput {
    const corrections = {
      volunteerChangeRequestsVolunteer: {
        some: { kind: CORRECTION, status: { in: UNFINISHED } },
      },
    };
    // no status: both, for the detail of one registration
    const volunteerStatus =
      query.status === 'in_correction'
        ? corrections
        : query.status === 'awaiting_review'
          ? { NOT: corrections }
          : {};
    const volunteers: Prisma.UserWhereInput = {
      kind: 'volunteer',
      volunteersUser: {
        is: {
          AND: [
            volunteerWhere(scope),
            volunteerStatus,
            query.districtId ? { districtId: query.districtId } : {},
          ],
        },
      },
    };
    // an official's registration has no corrections and no district of residence
    const staffRows: Prisma.UserWhereInput | null =
      staff && query.status !== 'in_correction' && !query.districtId
        ? { kind: 'staff', ...SELF_REGISTERED }
        : null;
    const kinds =
      query.kind === 'volunteer'
        ? [volunteers]
        : query.kind === 'staff'
          ? [staffRows]
          : [volunteers, staffRows];
    const or = kinds.filter((k): k is Prisma.UserWhereInput => k !== null);
    return { state: 'pending', OR: or.length ? or : [{ id: { in: [] } }] };
  }

  async list(query: RegistrationListQuery, actor: Principal, scope: Scope) {
    const sort = parseSort(
      undefined,
      ['createdAt', 'id'],
      [{ field: 'createdAt', direction: 'asc' }],
    );
    const binding = `registrations.list|${actor.userId}`;
    const cursor = query.cursor
      ? decodeCursor(this.env.CURSOR_SECRET, binding, query.cursor)
      : undefined;
    const direction = cursor?.d ?? 'next';
    const filter = this.pendingWhere(scope, await this.decidesStaff(actor.userId), {
      ...query,
      status: query.status ?? 'awaiting_review',
    });
    const [fetched, total] = await Promise.all([
      this.prisma.user.findMany({
        where: cursor ? { AND: [filter, keysetWhere(sort, cursor)] } : filter,
        orderBy: orderBy(sort, direction),
        take: query.limit + 1,
        select: pendingSelect,
      }),
      query.include === 'total' ? this.prisma.user.count({ where: filter }) : undefined,
    ]);
    const { rows, meta } = buildPage(fetched, {
      limit: query.limit,
      sort,
      direction,
      hadCursor: Boolean(cursor),
      secret: this.env.CURSOR_SECRET,
      binding,
      total,
    });
    return { rows: rows.map(pendingView), meta };
  }

  /** How many registrations of one kind wait for a decision in the scope (the My Work home). */
  async waitingCount(actor: Principal, scope: Scope, kind: 'volunteer' | 'staff'): Promise<number> {
    const filter = this.pendingWhere(scope, await this.decidesStaff(actor.userId), {
      kind,
      status: 'awaiting_review',
    });
    return this.prisma.user.count({ where: filter });
  }

  /**
   * One pending registration in scope, or 404 (docs/security/RBAC.md, "Object-level checks for
   * ASSIGNED and SELF").
   */
  async detail(actor: Principal, scope: Scope, userId: string) {
    const staff = await this.decidesStaff(actor.userId);
    const user = await this.prisma.user.findFirst({
      where: { AND: [{ id: userId }, this.pendingWhere(scope, staff, { status: undefined })] },
      select: {
        ...pendingSelect,
        mobile: true,
        email: true,
        homeProgramId: true,
        homeDivisionId: true,
        volunteersUser: {
          select: {
            ...pendingSelect.volunteersUser.select,
            id: true,
            userId: true,
            fatherName: true,
            motherName: true,
            nid: true,
            whatsapp: true,
            unionId: true,
            upazilaId: true,
            addressLine: true,
            education: true,
            experience: true,
            workDescription: true,
            previousProjects: true,
            facebookId: true,
            ...DETAILS_SELECT,
            bankName: true,
            bankAccountName: true,
            bankAccountNumber: true,
            bankBranchName: true,
            bankRoutingNumber: true,
            photoFileId: true,
            nidPhotoFileId: true,
            nidPhotoBackFileId: true,
            referenceVolunteerId: true,
            approvedAt: true,
            volunteerChangeRequestsVolunteer: {
              where: { kind: CORRECTION },
              orderBy: { createdAt: 'asc' },
            },
          },
        },
      },
    });
    if (!user) return this.notFound(scope);
    const v = user.volunteersUser;
    const staffPhoto = v
      ? null
      : await this.prisma.fileLink.findFirst({
          where: { entityType: 'user', entityId: user.id, slot: 'photo' },
          select: { fileId: true },
        });
    const blocklisted = v
      ? (await this.prisma.blocklist.count({
          where: { subjectType: 'volunteer', subjectId: v.id, active: true },
        })) > 0
      : false;
    return {
      ...pendingView(user),
      mobile: user.mobile,
      email: user.email,
      photoFileId: v?.photoFileId ?? staffPhoto?.fileId ?? null,
      homeProgramId: user.homeProgramId,
      homeDivisionId: user.homeDivisionId,
      volunteer: v
        ? {
            id: v.id,
            userId: v.userId,
            displayName: user.displayName,
            type: v.type,
            state: 'pending',
            districtId: v.districtId,
            upazilaId: v.upazilaId,
            fatherName: v.fatherName,
            motherName: v.motherName,
            mobile: user.mobile,
            whatsapp: v.whatsapp,
            divisionId: v.divisionId,
            unionId: v.unionId,
            addressLine: v.addressLine,
            education: v.education,
            experience: v.experience,
            workDescription: v.workDescription,
            previousProjects: v.previousProjects,
            facebookId: v.facebookId,
            ...detailsView(v),
            nid: v.nid,
            nidPhotoFileId: v.nidPhotoFileId,
            nidPhotoBackFileId: v.nidPhotoBackFileId,
            bank: {
              bankName: v.bankName,
              accountName: v.bankAccountName,
              accountNumber: v.bankAccountNumber,
              branchName: v.bankBranchName,
              routingNumber: v.bankRoutingNumber,
            },
            photoFileId: v.photoFileId,
            referenceVolunteerId: v.referenceVolunteerId,
            approvedAt: v.approvedAt?.toISOString() ?? null,
          }
        : null,
      blocklisted,
      // the corrected values are in the profile itself; the rows say what was asked
      corrections: (v?.volunteerChangeRequestsVolunteer ?? []).map((r) => changeView(r, false)),
    };
  }

  private notFound(scope: Scope): never {
    this.access.denied(scope.actorId, scope.permission, scope.entity);
    throw new ApiError('permission.not_found', 404);
  }

  /**
   * A pending volunteer in scope (with its corrections) for a decision: the user row is locked
   * first and read after, so two decisions at once run one after the other on fresh data.
   */
  private async pendingVolunteer(tx: Tx, scope: Scope, userId: string) {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
    const user = await tx.user.findFirst({
      where: {
        id: userId,
        kind: 'volunteer',
        state: 'pending',
        volunteersUser: { is: volunteerWhere(scope) },
      },
      select: {
        id: true,
        volunteersUser: {
          select: {
            id: true,
            type: true,
            volunteerChangeRequestsVolunteer: {
              where: { kind: CORRECTION, status: { in: UNFINISHED } },
              select: { id: true, status: true },
            },
          },
        },
      },
    });
    if (!user?.volunteersUser) return this.notFound(scope);
    return { userId: user.id, volunteer: user.volunteersUser };
  }

  /** Approves a volunteer registration: active account, approval stamp, the type's role. */
  async approve(actor: Principal, scope: Scope, userId: string) {
    const now = this.clock.now();
    const result = await this.prisma.$transaction(async (tx) => {
      const { volunteer } = await this.pendingVolunteer(tx, scope, userId);
      const rows = volunteer.volunteerChangeRequestsVolunteer;
      if (rows.some((r) => r.status === 'open'))
        throw new ApiError('registration.open_corrections', 409);
      if (rows.length) throw new ApiError('registration.not_resubmitted', 409);
      const blocked = await tx.blocklist.count({
        where: { subjectType: 'volunteer', subjectId: volunteer.id, active: true },
      });
      if (blocked) throw new ApiError('registration.blocklisted', 409);
      const role = `volunteer_${volunteer.type}`;
      await tx.user.update({ where: { id: userId }, data: { state: 'active' } });
      const approved = await tx.volunteer.update({
        where: { id: volunteer.id },
        data: { approvedAt: now, approvedBy: actor.userId },
        select: {
          id: true,
          userId: true,
          type: true,
          districtId: true,
          upazilaId: true,
          approvedAt: true,
          user: { select: { displayName: true } },
        },
      });
      const held = await tx.userRole.count({
        where: { userId, roleKey: role, revokedAt: null },
      });
      if (!held)
        await tx.userRole.create({
          data: { id: uuidv7(), userId, roleKey: role, grantedBy: actor.userId },
        });
      await this.versions.bump(tx, userId, {
        action: 'auth.approved',
        new: { kind: 'volunteer', role },
      });
      await this.events.registrationDecided(tx, userId, { approved: true }, actor.userId);
      return approved;
    });
    return {
      id: result.id,
      userId: result.userId,
      displayName: result.user.displayName,
      type: result.type,
      state: 'active',
      districtId: result.districtId,
      upazilaId: result.upazilaId,
      approvedAt: result.approvedAt?.toISOString() ?? null,
    };
  }

  /** Rejects a volunteer registration with a reason; the person may register again. */
  async reject(actor: Principal, scope: Scope, userId: string, reason: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const { volunteer } = await this.pendingVolunteer(tx, scope, userId);
      // told before the account closes: the notice waits for the person who registers again
      await this.events.registrationDecided(tx, userId, { approved: false, reason }, actor.userId);
      await this.close(tx, actor, userId, reason);
      await tx.volunteerChangeRequest.updateMany({
        where: { volunteerId: volunteer.id, kind: CORRECTION, status: { in: UNFINISHED } },
        data: { status: 'closed', decidedBy: actor.userId, decidedAt: this.clock.now() },
      });
    });
  }

  /** A rejected account: deactivated, its sessions ended, the reason audited. */
  private async close(tx: Tx, actor: Principal, userId: string, reason: string): Promise<void> {
    await tx.user.update({
      where: { id: userId },
      data: { state: 'deactivated', deactivatedAt: this.clock.now() },
    });
    await this.sessions.revokeAll(tx, userId, {
      by: actor.userId,
      reason: 'registration_rejected',
    });
    await this.versions.bump(tx, userId, { action: 'auth.rejected', reason });
  }

  /** Opens one correction row per named field with one note. */
  async requestCorrections(
    actor: Principal,
    scope: Scope,
    userId: string,
    body: RegistrationCorrectionCreate,
  ) {
    const fields = [...new Set(body.fields)];
    const rows = await this.prisma.$transaction(async (tx) => {
      const { volunteer } = await this.pendingVolunteer(tx, scope, userId);
      const busy = await tx.volunteerChangeRequest.count({
        where: {
          volunteerId: volunteer.id,
          kind: CORRECTION,
          status: { in: UNFINISHED },
          field: { in: fields },
        },
      });
      if (busy) throw new ApiError('registration.open_corrections', 409);
      const created: ChangeRow[] = [];
      for (const field of fields)
        created.push(
          await tx.volunteerChangeRequest.create({
            data: {
              id: uuidv7(),
              userId,
              volunteerId: volunteer.id,
              kind: CORRECTION,
              field,
              note: body.note,
              requestedBy: actor.userId,
            },
          }),
        );
      await this.audit.record(tx, {
        action: 'auth.correction_requested',
        entityType: 'user',
        entityId: userId,
        new: { fields },
        reason: body.note,
      });
      await this.events.correctionRequested(tx, userId, fields, body.note, actor.userId);
      return created;
    });
    return rows.map((r) => changeView(r, false));
  }

  /** The Department Head or the Monitoring Team decides a staff registration. */
  async decideStaff(actor: Principal, userId: string, body: StaffDecision): Promise<void> {
    if (body.decision === 'approve') {
      if (!isGivableOfficialRole(this.registry, body.roleKey!))
        throw new ApiError('validation.failed', 422, undefined, [
          { path: 'roleKey', code: 'validation.option_unknown' },
        ]);
    }
    const refused = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
      const user = await tx.user.findFirst({
        where: { id: userId, kind: 'staff', state: 'pending', ...SELF_REGISTERED },
        select: { id: true },
      });
      if (!user) {
        this.access.denied(actor.userId, 'staff.registration.approve', 'global');
        throw new ApiError('permission.not_found', 404);
      }
      // the role must be one this person may give; nothing is written when it is not
      const rule =
        body.decision === 'approve'
          ? roleRefusal(this.registry, await this.access.rolesOf(actor.userId, tx), body.roleKey!)
          : null;
      if (rule) return rule;
      if (body.decision === 'reject') {
        await this.events.registrationDecided(
          tx,
          userId,
          { approved: false, reason: body.reason! },
          actor.userId,
        );
        await this.close(tx, actor, userId, body.reason!);
        return null;
      }
      // a role with global scope asks for 12 characters; the 8 of the registration are not enough,
      // so the person chooses a new password at the next sign-in
      // (the same stored flag that sets the password length in AuthService)
      const stored = await tx.role.findUnique({
        where: { key: body.roleKey! },
        select: { globalScope: true },
      });
      const passwordChangeRequired = stored?.globalScope === true;
      await tx.user.update({
        where: { id: userId },
        data: { state: 'active', passwordChangeRequired },
      });
      await tx.userRole.create({
        data: { id: uuidv7(), userId, roleKey: body.roleKey!, grantedBy: actor.userId },
      });
      await this.versions.bump(tx, userId, {
        action: 'auth.approved',
        new: { kind: 'staff', role: body.roleKey },
      });
      await this.events.registrationDecided(tx, userId, { approved: true }, actor.userId);
      return null;
    });
    if (refused)
      await refuseRole({ prisma: this.prisma, audit: this.audit }, refused, body.roleKey!, userId);
    // `bump` evicted inside the transaction; a request in between may have cached the old facts
    this.sessions.evictUser(userId);
  }

  /** The caller's own open correction and edit requests, with their values (own data). */
  async ownRequests(principal: Principal) {
    const rows = await this.prisma.volunteerChangeRequest.findMany({
      where: { userId: principal.userId, status: { in: UNFINISHED } },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => changeView(r, true));
  }

  /**
   * Answers one own correction row: the value is checked by its field and written into the
   * pending profile at once; the row waits for the resubmit.
   */
  async answer(principal: Principal, requestId: string, body: ChangeRequestAnswer) {
    // counted within the last hour: typing mistakes of earlier days never lock a registrant out
    const refused = await this.prisma.auditLog.count({
      where: {
        action: 'auth.correction_refused',
        entityType: 'user',
        entityId: principal.userId,
        createdAt: { gt: new Date(this.clock.now().getTime() - REFUSAL_WINDOW_MS) },
      },
    });
    if (refused >= MAX_REFUSED_ANSWERS) throw new ApiError('rate_limit.exceeded', 429);
    try {
      return await this.answerRow(principal, requestId, body);
    } catch (error) {
      // a refused answer is counted, so an NID correction cannot test NIDs without end
      if (error instanceof ApiError && [409, 422].includes(error.status))
        await this.prisma.$transaction((tx) =>
          this.audit.record(tx, {
            action: 'auth.correction_refused',
            entityType: 'user',
            entityId: principal.userId,
            new: { requestId, code: error.code },
          }),
        );
      throw error;
    }
  }

  private async answerRow(principal: Principal, requestId: string, body: ChangeRequestAnswer) {
    const row = await this.prisma.volunteerChangeRequest.findFirst({
      where: {
        id: requestId,
        kind: CORRECTION,
        status: { in: UNFINISHED },
        volunteer: { userId: principal.userId, user: { state: 'pending' } },
      },
    });
    // a correction always names its volunteer (the table's person check)
    if (!row?.volunteerId) throw new ApiError('permission.not_found', 404);
    const volunteerId = row.volunteerId;
    const field = row.field as CorrectionField;
    const schema = CORRECTION_FIELD_VALUES[field];
    const parsed = schema?.safeParse(body.newValue);
    if (!parsed?.success)
      throw new ApiError('validation.failed', 422, undefined, [
        { path: 'newValue', code: parsed?.error.issues[0]?.message ?? 'validation.failed' },
      ]);
    const value = parsed.data as unknown;
    if ((PHOTO_SLOTS as readonly string[]).includes(field) && value !== row.newValue)
      // a photo is answered with the file the own upload stored on this request
      throw new ApiError('validation.failed', 422, undefined, [
        { path: 'newValue', code: 'validation.option_unknown' },
      ]);
    if (field === 'address' || field === 'permanentAddress') {
      const problem = await addressProblem(
        this.prisma,
        value as Parameters<typeof addressProblem>[1],
      );
      if (problem)
        throw new ApiError('validation.failed', 422, undefined, [
          { path: `newValue.${problem}`, code: 'validation.option_unknown' },
        ]);
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      if (field === 'nid') {
        const taken = await tx.volunteer.count({
          where: { nid: value as string, NOT: { id: volunteerId } },
        });
        if (taken) throw new ApiError('registration.nid_exists', 409);
      }
      await applyField(tx, principal.userId, volunteerId, field, value);
      const saved = await tx.volunteerChangeRequest.update({
        where: { id: row.id },
        data: {
          newValue: typeof value === 'string' ? value : JSON.stringify(value),
          status: 'submitted',
        },
      });
      // the field name only: identity and bank values stay out of the log (docs/security/RBAC.md,
      // "Field-level protection")
      await this.audit.record(tx, {
        action: 'auth.correction_answered',
        entityType: 'user',
        entityId: principal.userId,
        new: { field, requestId: row.id },
      });
      return saved;
    });
    return changeView(updated, true);
  }

  /** Returns the corrected registration to the approvers once every row is answered. */
  async resubmit(principal: Principal): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const rows = await tx.volunteerChangeRequest.findMany({
        where: {
          kind: CORRECTION,
          status: { in: UNFINISHED },
          volunteer: { userId: principal.userId, user: { state: 'pending' } },
        },
        select: { id: true, status: true },
      });
      if (rows.some((r) => r.status === 'open'))
        throw new ApiError('registration.open_corrections', 409);
      if (!rows.length) throw new ApiError('user.transition_not_allowed', 409);
      await tx.volunteerChangeRequest.updateMany({
        where: { id: { in: rows.map((r) => r.id) } },
        // closed by the registrant's resubmit: the time, no decider
        data: { status: 'closed', decidedAt: this.clock.now() },
      });
      await this.audit.record(tx, {
        action: 'auth.correction_resubmitted',
        entityType: 'user',
        entityId: principal.userId,
        new: { requests: rows.length },
      });
      // the corrected registration waits for the approvers again
      await this.events.registrationPending(tx, principal.userId);
    });
  }
}

/** Writes one corrected or approved value into the profile (users or volunteers columns). */
export async function applyField(
  tx: Tx,
  userId: string,
  volunteerId: string,
  field: CorrectionField,
  value: unknown,
): Promise<void> {
  if (field === 'name') {
    await tx.user.update({ where: { id: userId }, data: { displayName: value as string } });
    return;
  }
  const data: Prisma.VolunteerUpdateInput = (() => {
    switch (field) {
      case 'address': {
        const a = value as {
          divisionId: string;
          districtId: string;
          upazilaId: string;
          unionId: string;
        };
        return {
          division: { connect: { id: a.divisionId } },
          district: { connect: { id: a.districtId } },
          upazila: { connect: { id: a.upazilaId } },
          union: { connect: { id: a.unionId } },
        };
      }
      case 'bank': {
        const b = value as Record<string, string | undefined>;
        return {
          bankName: b.bankName ?? null,
          bankAccountName: b.accountName ?? null,
          bankAccountNumber: b.accountNumber ?? null,
          bankBranchName: b.branchName ?? null,
          bankRoutingNumber: b.routingNumber ?? null,
        };
      }
      case 'photo':
        return { photoFile: { connect: { id: value as string } } };
      case 'nid_photo':
        return { nidPhotoFile: { connect: { id: value as string } } };
      case 'nid_photo_back':
        return { nidPhotoBackFile: { connect: { id: value as string } } };
      default:
        return detailsUpdate(field, value) ?? { [field]: (value as string | undefined) ?? null };
    }
  })();
  await tx.volunteer.update({ where: { id: volunteerId }, data });
}
