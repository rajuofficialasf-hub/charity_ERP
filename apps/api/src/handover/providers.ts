import { uuidv7 } from '@css/shared';
import type { Tx } from '../core/prisma.service';
import { ApiError } from '../i18n/api-error';

/**
 * The pending work of an official, by provider. Each module that gives an official work plugs in a
 * provider; the modules that do not exist yet (reviews and approvals, documents, issues,
 * follow-ups) have empty providers that list nothing until they replace them.
 */
export type HandoverCategory =
  'reviews_approvals' | 'projects' | 'documents' | 'issues' | 'followups';

/** The item types of the providers (a subset of the `handovers.scope` item types). */
export const HANDOVER_ITEM_TYPES = [
  'program',
  'project_area',
  'project_staff',
  'pending_review',
  'document',
  'issue',
  'followup',
] as const;
export type HandoverItemType = (typeof HANDOVER_ITEM_TYPES)[number];

export interface HandoverItem {
  category: HandoverCategory;
  itemType: HandoverItemType;
  itemId: string;
  projectId: string | null;
  label: string;
  /** The role the receiving official must hold for this item. */
  requiredRole: string | null;
}

export interface HandoverProvider {
  itemType: HandoverItemType;
  list(db: Tx, userId: string): Promise<HandoverItem[]>;
  /** Moves one listed item; an item that is no longer the official's is refused (stale). */
  reassign(tx: Tx, item: HandoverItem, from: string, to: string, actorId: string): Promise<void>;
}

const stale = () =>
  new ApiError('validation.failed', 422, undefined, [
    { path: 'items', code: 'validation.option_unknown' },
  ]);

const programs: HandoverProvider = {
  itemType: 'program',
  async list(db, userId) {
    const rows = await db.program.findMany({
      where: { pmUserId: userId },
      select: { id: true, code: true, nameBn: true },
      orderBy: { code: 'asc' },
    });
    return rows.map((p) => ({
      category: 'projects',
      itemType: 'program',
      itemId: p.id,
      projectId: null,
      label: `${p.code} · ${p.nameBn}`,
      requiredRole: 'program_manager',
    }));
  },
  async reassign(tx, item, from, to) {
    const moved = await tx.program.updateMany({
      where: { id: item.itemId, pmUserId: from },
      data: { pmUserId: to },
    });
    if (!moved.count) throw stale();
  },
};

const projectAreas: HandoverProvider = {
  itemType: 'project_area',
  async list(db, userId) {
    const rows = await db.projectArea.findMany({
      where: { rpmUserId: userId },
      select: {
        id: true,
        projectId: true,
        project: { select: { code: true } },
        location: { select: { nameBn: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((a) => ({
      category: 'projects',
      itemType: 'project_area',
      itemId: a.id,
      projectId: a.projectId,
      label: `${a.project.code} · ${a.location.nameBn}`,
      requiredRole: 'regional_program_manager',
    }));
  },
  async reassign(tx, item, from, to) {
    const moved = await tx.projectArea.updateMany({
      where: { id: item.itemId, rpmUserId: from },
      data: { rpmUserId: to },
    });
    if (!moved.count) throw stale();
  },
};

/** A project staff row is ended and a new one opened for the receiver (the history stays). */
const projectStaff: HandoverProvider = {
  itemType: 'project_staff',
  async list(db, userId) {
    const rows = await db.projectStaff.findMany({
      where: { userId, endedAt: null },
      select: { id: true, projectId: true, roleKey: true, project: { select: { code: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => ({
      category: 'projects',
      itemType: 'project_staff',
      itemId: r.id,
      projectId: r.projectId,
      label: `${r.project.code} · ${r.roleKey}`,
      requiredRole: r.roleKey,
    }));
  },
  async reassign(tx, item, from, to, actorId) {
    const row = await tx.projectStaff.findFirst({
      where: { id: item.itemId, userId: from, endedAt: null },
    });
    if (!row) throw stale();
    const busy = await tx.projectStaff.count({
      where: { projectId: row.projectId, userId: to, endedAt: null },
    });
    if (busy) throw new ApiError('handover.target_invalid', 422);
    await tx.projectStaff.update({ where: { id: row.id }, data: { endedAt: new Date() } });
    await tx.projectStaff.create({
      data: {
        id: uuidv7(),
        projectId: row.projectId,
        userId: to,
        roleKey: row.roleKey,
        areaLocationId: row.areaLocationId,
        canView: row.canView,
        canEdit: row.canEdit,
        canDelete: row.canDelete,
        extraPermissions: row.extraPermissions,
        grantedBy: actorId,
      },
    });
  },
};

/** A module that does not exist yet: nothing to hand over until it plugs in its provider. */
const empty = (itemType: HandoverItemType): HandoverProvider => ({
  itemType,
  list: async () => [],
  reassign: async () => {
    throw stale();
  },
});

export const HANDOVER_PROVIDERS: HandoverProvider[] = [
  programs,
  projectAreas,
  projectStaff,
  empty('pending_review'),
  empty('document'),
  empty('issue'),
  empty('followup'),
];

/** The provider of an item type. */
export function providerOf(itemType: HandoverItemType): HandoverProvider {
  const provider = HANDOVER_PROVIDERS.find((p) => p.itemType === itemType);
  if (!provider) throw new Error(`no handover provider for ${itemType}`);
  return provider;
}

/** Everything an official still owns, from every provider. */
export async function pendingHandoverItems(db: Tx, userId: string): Promise<HandoverItem[]> {
  const lists = await Promise.all(HANDOVER_PROVIDERS.map((p) => p.list(db, userId)));
  return lists.flat();
}

/**
 * The items an assignment moves: every pending item when none are named (reassign all), else the
 * named ones, each of which must be pending now (another user's item or one already moved: 422).
 */
export function pickItems(
  pending: HandoverItem[],
  requested: { itemType: HandoverItemType; itemId: string }[] | undefined,
): HandoverItem[] {
  if (!requested) return pending;
  return requested.map((r, i) => {
    const item = pending.find((p) => p.itemType === r.itemType && p.itemId === r.itemId);
    if (!item)
      throw new ApiError('validation.failed', 422, undefined, [
        { path: `items.${i}`, code: 'validation.option_unknown' },
      ]);
    return item;
  });
}
