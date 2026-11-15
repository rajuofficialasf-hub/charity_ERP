import { formatBenNo } from '@css/shared/beneficiaries';
import { beneficiaryReachedByAll, type Scope } from '../access/scope.js';
import type { Tx } from '../core/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { BeneficiaryFamilyService, type MemberRelationship } from './beneficiary-family.js';
import {
  helpView,
  personApplications,
  personApplicationsWhere,
  visibleProjects,
} from './help-history.js';

/**
 * The family on a beneficiary's profile (docs/MASTER_SPEC.md, "Beneficiary 360° profile and
 * beneficiary tab"): the members of the household now, each linked to the profile it probably
 * is, the families that probably hold the person as a member, and what the family received. A
 * profile is named only where the viewer reaches it; one the viewer does not reach is neither
 * linked nor hinted at, and its help is told only as a number of people.
 */

/** Another profile the family section names, for a viewer who reaches it. */
export interface ProfileRef {
  beneficiaryId: string;
  /** The BEN number as officials read it out (BEN-0000123). */
  benNo: string;
  name: string;
}

/** A member row as the profile read gives it, with the application whose list it came from. */
export interface MemberRow {
  id: string;
  sourceApplicationId: string | null;
  createdAt: Date;
}

/**
 * The members of the household now: of the person's active rows, the one list whose application
 * was submitted last, by the rule of a replacement (services/beneficiary-family-members.ts,
 * `replaceFrom`): a list of no application, or of a deleted one, is older than any other, and
 * between two such lists the one written last stands. A merge keeps one list active, so two
 * active lists are not expected; were they there, the profile still shows one household and writes
 * nothing.
 */
export async function currentMembers<T extends MemberRow>(
  tx: Tx,
  members: readonly T[],
): Promise<T[]> {
  const sources = [
    ...new Set(members.map((m) => m.sourceApplicationId).filter((s): s is string => s !== null)),
  ];
  if (!sources.length && members.length <= 1) return [...members];
  const times = new Map(
    (
      await tx.application.findMany({
        where: { id: { in: sources }, status: { not: 'deleted' } },
        select: { id: true, submittedAt: true },
      })
    ).map((a) => [a.id, a.submittedAt?.getTime() ?? Number.NEGATIVE_INFINITY]),
  );
  const lists = new Map<string, { time: number; written: number }>();
  for (const m of members) {
    const key = m.sourceApplicationId ?? '';
    const time = m.sourceApplicationId
      ? (times.get(m.sourceApplicationId) ?? Number.NEGATIVE_INFINITY)
      : Number.NEGATIVE_INFINITY;
    const list = lists.get(key) ?? { time, written: 0 };
    list.written = Math.max(list.written, m.createdAt.getTime());
    lists.set(key, list);
  }
  const [newest] = [...lists.entries()].sort(
    ([, a], [, b]) => b.time - a.time || b.written - a.written,
  );
  return members.filter((m) => (m.sourceApplicationId ?? '') === newest![0]);
}

/** The match of a member to a live profile: the member's name, the head as father or husband. */
interface MemberMatch {
  member_id: string;
  id: string;
  ben_no: number;
  name: string;
  reached: boolean;
  help_count: number;
}

/**
 * The live profiles the members probably are, by the rule of the review's family signal
 * (services/beneficiary-family.ts, `membersOf`) read the other way: a profile with the member's
 * name key whose father's or husband's name is the head's name, in the head's union and village.
 * Every match, each with whether the viewer's scope reaches it.
 */
async function matchesOf(
  tx: Tx,
  headId: string,
  memberIds: readonly string[],
  scope: Scope,
): Promise<MemberMatch[]> {
  if (!memberIds.length) return [];
  return tx.$queryRaw<MemberMatch[]>`
    SELECT m.id AS member_id, x.id, x.ben_no, x.name, x.help_count,
           ${beneficiaryReachedByAll([scope], 'x')} AS reached
    FROM beneficiaries head
    JOIN beneficiary_family_members m ON m.id = ANY(${[...memberIds]}::uuid[])
    JOIN beneficiaries x ON x.name_key = m.name_key AND x.guardian_key = head.name_key
      AND x.union_id = head.union_id AND x.village_key = head.village_key
      AND x.merged_into_id IS NULL AND x.id <> head.id
    WHERE head.id = ${headId}::uuid
    ORDER BY m.id, x.ben_no`;
}

/** The family that probably holds the person as a member, named for a viewer who reaches it. */
export interface MemberOf {
  head: ProfileRef;
  relationships: MemberRelationship[];
}

export interface FamilySection {
  /** The members now; each id is in `links` where it probably has a profile the viewer reaches. */
  memberIds: Set<string>;
  links: Map<string, ProfileRef>;
  memberOf: MemberOf[];
  /** What the family received, or null where the viewer may not see the help or no member is known. */
  help: (ReturnType<typeof helpView> & { people: number; notShown: number }) | null;
}

/**
 * The family section of one profile, inside the profile's read. `members` are the person's active
 * rows; `own` the person's applications as the profile read them; `rows` the projects whose rows
 * the viewer sees in a profile (a project outside is counted, never named).
 */
export async function familySection(
  tx: Tx,
  input: {
    headId: string;
    members: readonly MemberRow[];
    scope: Scope;
    seesHelp: boolean;
    own: Awaited<ReturnType<typeof personApplications>>;
    rows: Prisma.ProjectWhereInput | null;
    thisYear: number;
  },
): Promise<FamilySection> {
  const now = await currentMembers(tx, input.members);
  const memberIds = new Set(now.map((m) => m.id));
  const matches = await matchesOf(tx, input.headId, [...memberIds], input.scope);
  const links = new Map<string, ProfileRef>();
  for (const m of matches)
    if (m.reached && !links.has(m.member_id))
      links.set(m.member_id, { beneficiaryId: m.id, benNo: formatBenNo(m.ben_no), name: m.name });
  const heads = await new BeneficiaryFamilyService().membersOf(tx, input.headId, input.scope);
  const memberOf = heads.rows
    .filter((h) => h.named)
    .map((h) => ({
      head: { beneficiaryId: h.headId, benNo: h.headBenNo, name: h.headName },
      relationships: h.relationships,
    }));
  if (!input.seesHelp || !memberIds.size) return { memberIds, links, memberOf, help: null };
  // the people of the family the viewer reaches, the person first, each once
  const linked = [...new Set([...links.values()].map((l) => l.beneficiaryId))];
  const notShown = new Set(matches.filter((m) => !m.reached && m.help_count > 0).map((m) => m.id))
    .size;
  const applications = new Map(input.own.map((a) => [a.id, a]));
  for (const id of linked)
    for (const a of await personApplications(tx, await personApplicationsWhere(tx, id)))
      applications.set(a.id, a);
  const all = [...applications.values()];
  const visible = await visibleProjects(tx, all, input.rows);
  return {
    memberIds,
    links,
    memberOf,
    help: { ...helpView(all, visible, input.thisYear), people: 1 + linked.length, notShown },
  };
}
