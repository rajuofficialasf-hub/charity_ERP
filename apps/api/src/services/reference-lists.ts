import { type PlatformKind, referenceListAttributesSchema, uuidv7 } from '@css/shared';
import {
  isEditableList,
  LISTS_WITH_KIND,
  type ReferenceItemCreate,
  type ReferenceItemUpdate,
} from '@css/shared/settings';
import type { AuditWriter } from '../audit/audit-writer';
import type { Principal } from '../auth/principal';
import type { PrismaService, Tx } from '../core/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { ApiError } from '../i18n/api-error';

const SELECT = {
  id: true,
  code: true,
  labelBn: true,
  labelEn: true,
  active: true,
  sortOrder: true,
  isSystem: true,
  attributes: true,
} satisfies Prisma.ReferenceListSelect;

type Row = Prisma.ReferenceListGetPayload<{ select: typeof SELECT }>;

export interface ReferenceItemView {
  code: string;
  label: { bn: string; en: string };
  active: boolean;
  sortOrder: number;
  /** An entry the rules need: kept active, its code fixed. */
  system: boolean;
  /** A media platform's kind; null on the other lists. */
  kind: PlatformKind | null;
}

const view = (r: Row): ReferenceItemView => ({
  code: r.code,
  label: { bn: r.labelBn, en: r.labelEn },
  active: r.active,
  sortOrder: r.sortOrder,
  system: r.isSystem,
  // a stored value the schema cannot read shows no kind, never fails the list
  kind: referenceListAttributesSchema.safeParse(r.attributes).data?.kind ?? null,
});

/** A kind is given exactly on the lists whose items carry one (on a new item; a change may omit it). */
function assertKind(listKey: string, kind: string | undefined, creating: boolean): void {
  const carries = LISTS_WITH_KIND.includes(listKey);
  if ((carries && creating && kind === undefined) || (!carries && kind !== undefined))
    throw new ApiError('validation.failed', 422, undefined, [
      { path: 'kind', code: carries ? 'validation.required' : 'validation.unknown_parameter' },
    ]);
}

const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

/**
 * The system-wide reference lists (docs/database/DATABASE_SCHEMA.md, "System-wide configurable
 * lists (reference_lists, FK enforced)" and "Per-project lists (validated by the service against
 * the project snapshot)"). Every signed-in user reads them; the settings page keeps the expense
 * categories and the issue types (`settings.manage`): items are added, relabelled, ordered,
 * deactivated and activated, never deleted, and a code never changes, so old records keep their
 * meaning. Every change is audited.
 */
export class ReferenceListsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditWriter,
  ) {}

  /** The items of a list in their order, inactive ones included and marked; 404 for no such list. */
  async items(listKey: string): Promise<ReferenceItemView[]> {
    const rows = await this.prisma.referenceList.findMany({
      where: { listKey },
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
      select: SELECT,
    });
    if (!rows.length) throw new ApiError('permission.not_found', 404);
    return rows.map(view);
  }

  async add(
    actor: Principal,
    listKey: string,
    body: ReferenceItemCreate,
  ): Promise<ReferenceItemView> {
    if (!isEditableList(listKey)) throw new ApiError('permission.not_found', 404);
    assertKind(listKey, body.kind, true);
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.lockList(tx, listKey);
        if (
          await tx.referenceList.findFirst({
            where: { listKey, code: body.code },
            select: { id: true },
          })
        )
          throw new ApiError('reference.code_taken', 409);
        const last = await tx.referenceList.aggregate({
          where: { listKey },
          _max: { sortOrder: true },
        });
        const row = await tx.referenceList.create({
          data: {
            id: uuidv7(),
            listKey,
            code: body.code,
            labelBn: body.label.bn,
            labelEn: body.label.en,
            active: body.active ?? true,
            sortOrder: body.sortOrder ?? (last._max.sortOrder ?? 0) + 1,
            ...(body.kind ? { attributes: { kind: body.kind } } : {}),
            createdBy: actor.userId,
            updatedBy: actor.userId,
          },
          select: SELECT,
        });
        await this.audit.record(tx, {
          action: 'settings.change',
          entityType: 'reference_list',
          entityId: row.id,
          new: { listKey, ...view(row) },
        });
        return view(row);
      });
    } catch (error) {
      // two additions of one code at the same moment: the unique index decides
      if (isUniqueViolation(error)) throw new ApiError('reference.code_taken', 409);
      throw error;
    }
  }

  async update(
    actor: Principal,
    listKey: string,
    code: string,
    body: ReferenceItemUpdate,
  ): Promise<ReferenceItemView> {
    if (!isEditableList(listKey)) throw new ApiError('permission.not_found', 404);
    assertKind(listKey, body.kind, false);
    return this.prisma.$transaction(async (tx) => {
      // lock before reading, so the audit's old value is the one this change replaces
      await this.lockList(tx, listKey);
      const before = await tx.referenceList.findFirst({ where: { listKey, code }, select: SELECT });
      if (!before) throw new ApiError('permission.not_found', 404);
      // an entry the rules need stays active
      if (before.isSystem && body.active === false)
        throw new ApiError('reference.system_entry', 409);
      // the kind decided the host of the links already given; it stays while any exists
      if (body.kind && body.kind !== view(before).kind && listKey === 'media_platform') {
        const used = await tx.mediaPublication.count({ where: { platformCode: code } });
        if (used) throw new ApiError('reference.kind_in_use', 409);
      }
      const row = await tx.referenceList.update({
        where: { id: before.id },
        // Prisma leaves out the undefined fields
        data: {
          labelBn: body.label?.bn,
          labelEn: body.label?.en,
          active: body.active,
          sortOrder: body.sortOrder,
          ...(body.kind ? { attributes: { kind: body.kind } } : {}),
          updatedBy: actor.userId,
        },
        select: SELECT,
      });
      await this.audit.record(tx, {
        action: 'settings.change',
        entityType: 'reference_list',
        entityId: row.id,
        old: { listKey, ...view(before) },
        new: { listKey, ...view(row) },
      });
      return view(row);
    });
  }

  /** One change at a time per list: the next sort order is not taken twice, the old value is current. */
  private async lockList(tx: Tx, listKey: string): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('reference_lists:' || ${listKey}))`;
  }
}
