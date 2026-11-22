import { uuidv7 } from '@css/shared';
import type { ExtraAreaRequest, ExtraAreaRow } from '@css/shared/access';
import type { ReasonRequest } from '@css/shared/auth';
import { extraAreaRefusal, type HardRule, type VolunteerReach } from '../access/hard-rules.js';
import type { Scope } from '../access/scope.js';
import type { AccessService } from '../access/service.js';
import type { AuditWriter } from '../audit/audit-writer.js';
import type { PermissionVersionService } from '../auth/permission-version.service.js';
import type { Principal } from '../auth/principal.js';
import type { Clock } from '../core/clock.js';
import { isUniqueViolation } from '../core/db-errors.js';
import type { PrismaService, Tx } from '../core/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { ApiError } from '../i18n/api-error.js';
import type { AccountEvents } from '../notifications/account-events.js';

/** The levels an extra area may name: a division or a district. */
const AREA_LEVELS: readonly string[] = ['division', 'district'];
/** The permission whose reach says where the giver sees volunteers. */
const VOLUNTEER_TAB = 'volunteer.view_all';

const invalid = (path: string) =>
  new ApiError('validation.failed', 422, undefined, [{ path, code: 'validation.option_unknown' }]);

const named = { select: { id: true, displayName: true } } as const;
const ROW = {
  id: true,
  wholeCountry: true,
  reason: true,
  grantedAt: true,
  endedAt: true,
  endReason: true,
  location: { select: { id: true, level: true, nameBn: true, nameEn: true } },
  grantedByRef: named,
  endedByRef: named,
} as const;

type StoredRow = Prisma.UserExtraAreaGetPayload<{ select: typeof ROW }>;

/** An extra area as the contract shows it. */
const rowView = (r: StoredRow): ExtraAreaRow => ({
  id: r.id,
  wholeCountry: r.wholeCountry,
  location: r.location
    ? {
        id: r.location.id,
        level: r.location.level,
        name: { bn: r.location.nameBn, en: r.location.nameEn },
      }
    : null,
  reason: r.reason,
  grantedAt: r.grantedAt.toISOString(),
  grantedBy: r.grantedByRef,
  endedAt: r.endedAt?.toISOString() ?? null,
  endedBy: r.endedByRef,
  endReason: r.endReason,
});

/**
 * The extra areas a person holds now, the newest first: what the person's own profile shows, so
 * it takes no scope (the caller reads the own record).
 */
export async function liveExtraAreas(
  db: Pick<PrismaService, 'userExtraArea'>,
  userId: string,
): Promise<ExtraAreaRow[]> {
  const rows = await db.userExtraArea.findMany({
    where: { userId, endedAt: null },
    orderBy: { grantedAt: 'desc' },
    select: ROW,
  });
  return rows.map(rowView);
}

/** The place of an extra area: the whole country, or one location with its parent. */
interface Place {
  wholeCountry: boolean;
  locationId: string | null;
  parentId: string | null;
  name: { bn: string; en: string } | null;
}

/**
 * The extra areas of an official (docs/security/RBAC.md, "Data scopes and their resolution";
 * docs/BUSINESS_RULES.md, "An official may be given an extra area"): a division, a district or the
 * whole country in which the person sees the volunteers whether or not a project of theirs is at
 * work there. The person above gives and takes it away, inside what that person reaches for
 * volunteers; the whole country is an Admin's or the Department Head's to give; nobody gives one
 * to themselves. Whoever gave an area may always take it away again, also after losing the reach
 * it was given from. Each change is audited on the person, raises the person's permission version
 * and is told to the person. An area that was given on stands on its own when the giver's is
 * ended.
 */
export class ExtraAreasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly audit: AuditWriter,
    private readonly access: AccessService,
    private readonly versions: PermissionVersionService,
    private readonly events: AccountEvents,
  ) {}

  /** Audits a refused change in a transaction of its own, then answers 403 with the rule. */
  private async refuse(
    userId: string,
    rule: HardRule,
    place: Pick<Place, 'wholeCountry' | 'locationId'>,
    reason: string,
  ): Promise<never> {
    await this.prisma.$transaction((tx) =>
      this.audit.record(tx, {
        action: 'permission_change_refused',
        entityType: 'user',
        entityId: userId,
        new: { extraArea: place, rule },
        reason,
      }),
    );
    throw new ApiError('permission.grant_refused', 403, { rule });
  }

  /** The official an extra area belongs to, inside the caller's scope (404 otherwise). */
  private async official(tx: Tx, actor: Principal, scope: Scope, userId: string) {
    // serializes the changes of one person: the panel and the version bump lock the same row
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
    const user = await this.access.findUser(
      scope,
      userId,
      { id: true, kind: true, state: true },
      tx,
    );
    // an extra area is an official's; a volunteer works where the projects place them
    if (user.kind !== 'staff') {
      this.access.denied(actor.userId, scope.permission, scope.entity);
      throw new ApiError('permission.not_found', 404);
    }
    return user;
  }

  /** Where the actor reaches volunteers, the actor's own extra areas among it. */
  private async reachOf(tx: Tx, actor: Principal): Promise<VolunteerReach> {
    const { instances } = await this.access.scopeOfUser(
      actor.userId,
      VOLUNTEER_TAB,
      'volunteer',
      tx,
    );
    return {
      everywhere: instances.global,
      locationIds: new Set(instances.areas.map((a) => a.locationId)),
    };
  }

  private async rule(tx: Tx, actor: Principal, userId: string, place: Place) {
    return extraAreaRefusal(
      { id: actor.userId, roles: await this.access.rolesOf(actor.userId, tx) },
      userId,
      place,
      await this.reachOf(tx, actor),
    );
  }

  /** The extra areas a person holds or held, the live ones first, then the newest. */
  async list(scope: Scope, userId: string): Promise<ExtraAreaRow[]> {
    await this.access.findUser(scope, userId, { id: true });
    const rows = await this.prisma.userExtraArea.findMany({
      where: { userId },
      orderBy: [{ endedAt: { sort: 'desc', nulls: 'first' } }, { grantedAt: 'desc' }],
      select: ROW,
    });
    return rows.map(rowView);
  }

  /** Gives an official a division, a district or the whole country, with a reason. */
  async give(actor: Principal, scope: Scope, userId: string, body: ExtraAreaRequest) {
    // one of the two: a location, or the whole country
    if (Boolean(body.locationId) === body.wholeCountry) throw invalid('locationId');
    let refused: { rule: HardRule; place: Place } | null;
    try {
      refused = await this.prisma.$transaction(async (tx) => {
        const user = await this.official(tx, actor, scope, userId);
        const place = await this.placeOf(tx, body);
        const rule = await this.rule(tx, actor, user.id, place);
        if (rule) return { rule, place };
        // an account that waits, is blocked or closed takes no new reach
        if (user.state !== 'active') throw new ApiError('user.extra_area_inactive', 409);
        const id = uuidv7();
        await tx.userExtraArea.create({
          data: {
            id,
            userId: user.id,
            locationId: place.locationId,
            wholeCountry: place.wholeCountry,
            reason: body.reason,
            grantedBy: actor.userId,
            grantedAt: this.clock.now(),
            createdBy: actor.userId,
            updatedBy: actor.userId,
          },
        });
        await this.versions.bump(tx, user.id, {
          action: 'user.extra_area_given',
          new: { id, locationId: place.locationId, wholeCountry: place.wholeCountry },
          reason: body.reason,
        });
        await this.events.extraAreaChanged(tx, user.id, 'given', place.name, actor.userId);
        return null;
      });
    } catch (error) {
      // the same live area twice, also when two requests give it at the same moment
      if (isUniqueViolation(error)) throw new ApiError('user.extra_area_exists', 409);
      throw error;
    }
    if (refused) return this.refuse(userId, refused.rule, refused.place, body.reason);
    this.versions.settled(userId);
    return this.list(scope, userId);
  }

  /** Takes an extra area away, with a reason; the areas given on from it stay. */
  async end(actor: Principal, scope: Scope, userId: string, areaId: string, body: ReasonRequest) {
    const refused = await this.prisma.$transaction(async (tx) => {
      const user = await this.official(tx, actor, scope, userId);
      const row = await tx.userExtraArea.findFirst({
        where: { id: areaId, userId: user.id, endedAt: null },
        select: {
          wholeCountry: true,
          grantedBy: true,
          location: { select: { id: true, parentId: true, nameBn: true, nameEn: true } },
        },
      });
      if (!row) throw new ApiError('permission.not_found', 404);
      const place: Place = {
        wholeCountry: row.wholeCountry,
        locationId: row.location?.id ?? null,
        parentId: row.location?.parentId ?? null,
        name: row.location ? { bn: row.location.nameBn, en: row.location.nameEn } : null,
      };
      // taking away what one gave oneself needs no reach: it only narrows what the person sees
      const ownGift = row.grantedBy === actor.userId && user.id !== actor.userId;
      const rule = ownGift ? null : await this.rule(tx, actor, user.id, place);
      if (rule) return { rule, place };
      await tx.userExtraArea.update({
        where: { id: areaId },
        data: {
          endedAt: this.clock.now(),
          endedBy: actor.userId,
          endReason: body.reason,
          updatedBy: actor.userId,
        },
      });
      await this.versions.bump(tx, user.id, {
        action: 'user.extra_area_ended',
        old: { id: areaId, locationId: place.locationId, wholeCountry: place.wholeCountry },
        reason: body.reason,
      });
      await this.events.extraAreaChanged(tx, user.id, 'ended', place.name, actor.userId);
      return null;
    });
    if (refused) return this.refuse(userId, refused.rule, refused.place, body.reason);
    this.versions.settled(userId);
    return this.list(scope, userId);
  }

  /** The place a request names: the whole country, or an active division or district. */
  private async placeOf(tx: Tx, body: ExtraAreaRequest): Promise<Place> {
    if (body.wholeCountry)
      return { wholeCountry: true, locationId: null, parentId: null, name: null };
    const location = await tx.location.findFirst({
      where: { id: body.locationId, active: true, level: { in: [...AREA_LEVELS] } },
      select: { id: true, parentId: true, nameBn: true, nameEn: true },
    });
    if (!location) throw invalid('locationId');
    return {
      wholeCountry: false,
      locationId: location.id,
      parentId: location.parentId,
      name: { bn: location.nameBn, en: location.nameEn },
    };
  }
}
