import {
  type NameVariantGroup,
  type NameVariantGroupCreate,
  type NameVariantGroupUpdate,
  spellingKey,
} from '@css/shared/beneficiaries';
import { uuidv7 } from '@css/shared';
import type { AuditWriter } from '../audit/audit-writer.js';
import type { Principal } from '../auth/principal.js';
import { assertIfMatch, etagOf } from '../core/etag.js';
import type { PrismaService, Tx } from '../core/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { ApiError } from '../i18n/api-error.js';
import type { JobRunner } from '../jobs/job-runner.js';
import { raiseVariantsVersion } from './match-keys.js';

const GROUP_SELECT = {
  id: true,
  canonical: true,
  active: true,
  updatedAt: true,
  spellings: {
    where: { active: true },
    select: { id: true, variant: true },
  },
} satisfies Prisma.NameVariantGroupSelect;

type GroupRow = Prisma.NameVariantGroupGetPayload<{ select: typeof GROUP_SELECT }>;

const view = (g: GroupRow): NameVariantGroup => ({
  id: g.id,
  canonical: g.canonical,
  variants: g.spellings
    .filter((s) => spellingKey(s.variant) !== spellingKey(g.canonical))
    .map((s) => s.variant)
    // one order whatever the rows' order: by the letters' code points
    .sort(),
  active: g.active,
  etag: etagOf(g.updatedAt),
});

/** A group as the audit keeps it: its spellings and state, not its version. */
const audited = ({ etag: _etag, ...group }: NameVariantGroup) => group;

/** Where a spelling of a request already stands in another group. */
interface Holder {
  groupId: string;
  /** Whether it is that group's canonical. */
  canonical: boolean;
}

/**
 * The spelling variants of names on the settings page (docs/database/DATABASE_SCHEMA.md,
 * "name_variant_groups"), which the name keys make equal word by word: the Department Head and the Monitoring Team list the groups, add
 * one, change its spellings and switch it off and on; nothing is deleted (a spelling taken out of
 * a group stays as a row that is no longer active). A spelling belongs to one group, switched on or
 * off, so switching a group on again never collides with another; and a group's canonical is never
 * a spelling of another group, nor another group's canonical a spelling of this one, so the list
 * holds no chains. Every change is audited (`name_variants.change`, the group before and after)
 * and, when it changes what the keys read, raises the list's version in the same transaction,
 * which queues the key job. A change names the version of the group it was made from (If-Match),
 * so a second official's save from the same read is refused instead of dropping the first's.
 */
export class NameVariantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditWriter,
    private readonly jobs: Pick<JobRunner, 'enqueue'>,
  ) {}

  /** Every group, switched off ones included, by its canonical. */
  async list(): Promise<NameVariantGroup[]> {
    const rows = await this.prisma.nameVariantGroup.findMany({
      select: GROUP_SELECT,
      orderBy: [{ canonical: 'asc' }, { id: 'asc' }],
    });
    return rows.map(view);
  }

  async add(actor: Principal, body: NameVariantGroupCreate): Promise<NameVariantGroup> {
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx);
      await this.refuseHeld(tx, body.canonical, body.variants, null);
      const group = await tx.nameVariantGroup.create({
        data: {
          id: uuidv7(),
          canonical: body.canonical,
          createdBy: actor.userId,
          updatedBy: actor.userId,
        },
        select: { id: true },
      });
      await tx.nameVariant.createMany({
        data: [body.canonical, ...body.variants].map((variant) => ({
          id: uuidv7(),
          groupId: group.id,
          variant,
          createdBy: actor.userId,
          updatedBy: actor.userId,
        })),
      });
      const created = view(await this.read(tx, group.id));
      await this.audit.record(tx, {
        action: 'name_variants.change',
        entityType: 'name_variant_group',
        entityId: group.id,
        new: audited(created),
      });
      await raiseVariantsVersion(tx, this.jobs, actor.userId);
      return created;
    });
  }

  async update(
    actor: Principal,
    groupId: string,
    body: NameVariantGroupUpdate,
    ifMatch: string | undefined,
  ): Promise<NameVariantGroup> {
    return this.prisma.$transaction(async (tx) => {
      // lock before reading, so the version compared and the audit's old value are the ones this
      // change replaces
      await this.lock(tx);
      const found = await tx.nameVariantGroup.findUnique({
        where: { id: groupId },
        select: GROUP_SELECT,
      });
      if (!found) throw new ApiError('permission.not_found', 404);
      assertIfMatch(ifMatch, found.updatedAt);
      const before = view(found);
      if (body.canonical !== undefined && body.variants !== undefined) {
        await this.refuseHeld(tx, body.canonical, body.variants, groupId);
        await this.respell(tx, actor, found, body.canonical, body.variants);
      }
      // the group's own row is written by every change, so its version moves even when only its
      // spellings changed
      await tx.nameVariantGroup.update({
        where: { id: groupId },
        data: {
          ...(body.active === undefined ? {} : { active: body.active }),
          updatedBy: actor.userId,
        },
        select: { id: true },
      });
      const after = view(await this.read(tx, groupId));
      await this.audit.record(tx, {
        action: 'name_variants.change',
        entityType: 'name_variant_group',
        entityId: groupId,
        old: audited(before),
        new: audited(after),
      });
      // the keys read the spellings of the groups that are on: a group that is off and stays off
      // changes nothing they read
      if (readsDiffer(before, after)) await raiseVariantsVersion(tx, this.jobs, actor.userId);
      return after;
    });
  }

  /**
   * Gives the group exactly these spellings: a spelling kept stays its row (rewritten where only
   * its letters' case or encoding changed), a new one gets a row, and one left out is no longer
   * active.
   */
  private async respell(
    tx: Tx,
    actor: Principal,
    group: GroupRow,
    canonical: string,
    variants: readonly string[],
  ): Promise<void> {
    const wanted = new Map([canonical, ...variants].map((s) => [spellingKey(s), s]));
    const kept = new Set<string>();
    for (const row of group.spellings) {
      const key = spellingKey(row.variant);
      const spelling = wanted.get(key);
      if (spelling === undefined) {
        await tx.nameVariant.update({
          where: { id: row.id },
          data: { active: false, updatedBy: actor.userId },
          select: { id: true },
        });
        continue;
      }
      kept.add(key);
      if (spelling !== row.variant)
        await tx.nameVariant.update({
          where: { id: row.id },
          data: { variant: spelling, updatedBy: actor.userId },
          select: { id: true },
        });
    }
    const added = [...wanted].filter(([key]) => !kept.has(key)).map(([, spelling]) => spelling);
    if (added.length)
      await tx.nameVariant.createMany({
        data: added.map((variant) => ({
          id: uuidv7(),
          groupId: group.id,
          variant,
          createdBy: actor.userId,
          updatedBy: actor.userId,
        })),
      });
    if (canonical !== group.canonical)
      await tx.nameVariantGroup.update({
        where: { id: group.id },
        data: { canonical, updatedBy: actor.userId },
        select: { id: true },
      });
  }

  /**
   * Refuses a spelling another group holds (422, on its field): the canonical of this group held
   * as another group's spelling, or a spelling of this group that is another group's canonical,
   * would make a chain; any other spelling held elsewhere is taken. Spellings compare in the key's
   * form, so a change of case or of the encoding is no new spelling.
   */
  private async refuseHeld(
    tx: Tx,
    canonical: string,
    variants: readonly string[],
    ownGroupId: string | null,
  ): Promise<void> {
    const rows = await tx.nameVariant.findMany({
      where: { active: true, ...(ownGroupId ? { groupId: { not: ownGroupId } } : {}) },
      select: { variant: true, groupId: true, group: { select: { canonical: true } } },
    });
    const held = new Map<string, Holder>();
    for (const row of rows)
      held.set(spellingKey(row.variant), {
        groupId: row.groupId,
        canonical: spellingKey(row.variant) === spellingKey(row.group.canonical),
      });
    const details: { path: string; code: string }[] = [];
    const holder = held.get(spellingKey(canonical));
    if (holder)
      details.push({
        path: 'canonical',
        code: holder.canonical ? 'validation.name_variant_taken' : 'validation.name_variant_chain',
      });
    variants.forEach((variant, index) => {
      const at = held.get(spellingKey(variant));
      if (at)
        details.push({
          path: `variants.${index}`,
          code: at.canonical ? 'validation.name_variant_chain' : 'validation.name_variant_taken',
        });
    });
    if (details.length) throw new ApiError('validation.failed', 422, undefined, details);
  }

  private async read(tx: Tx, groupId: string): Promise<GroupRow> {
    return tx.nameVariantGroup.findUniqueOrThrow({ where: { id: groupId }, select: GROUP_SELECT });
  }

  /** One change of the list at a time, so a spelling is never given to two groups at once. */
  private async lock(tx: Tx): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('name_variants'))`;
  }
}

/** Whether the name keys read the two states of a group differently. */
function readsDiffer(before: NameVariantGroup, after: NameVariantGroup): boolean {
  if (!before.active && !after.active) return false;
  if (before.active !== after.active) return true;
  const spelled = (g: NameVariantGroup) =>
    [spellingKey(g.canonical), ...g.variants.map(spellingKey).sort()].join(' ');
  return spelled(before) !== spelled(after);
}
