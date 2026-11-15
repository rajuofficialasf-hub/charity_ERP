import { formatBenNo } from '@css/shared/beneficiaries';
import { COUNTED_ROWS_MAX } from '@css/shared/forms';
import { beneficiaryReachedByAll, type Scope } from '../access/scope.js';
import type { Tx } from '../core/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { MemberRelationship } from './beneficiary-family.js';
import { helpView, leftBehindSql, personApplications, visibleProjects } from './help-history.js';

/**
 * The most members of one household linked to a profile and counted in the family's help: the
 * most rows a counted group of a form holds. A list written with more rows links its first ones,
 * in the order it was written; the members themselves are all listed.
 */
export const FAMILY_LINKS_MAX = COUNTED_ROWS_MAX;

/** At most this many families that hold the person are named, as the review names them. */
const MEMBER_OF_SHOWN = 10;

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

/** The profile a member probably is: one per member, the lowest BEN number of all its matches. */
interface MemberMatch {
  member_id: string;
  id: string;
  ben_no: number;
  name: string;
  reached: boolean;
  help_count: number;
}

/**
 * The live profile each member probably is, by the rule of the review's family signal
 * (services/beneficiary-family.ts, `membersOf`) read the other way: a profile with the member's
 * name key whose father's or husband's name is the head's name, in the head's union and village. A
 * missing key is stored as NULL and equals nothing, so a name or a village of no letter matches
 * nobody. Of several matches the one with the lowest BEN number is the member's, chosen before the
 * viewer's reach is looked at, so every viewer means the same person and the choice tells nothing
 * of the profiles beyond reach; then whether the viewer's scope reaches it.
 */
async function matchesOf(
  tx: Tx,
  headId: string,
  memberIds: readonly string[],
  scope: Scope,
): Promise<MemberMatch[]> {
  if (!memberIds.length) return [];
  return tx.$queryRaw<MemberMatch[]>`
    SELECT DISTINCT ON (m.id) m.id AS member_id, x.id, x.ben_no, x.name, x.help_count,
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

/**
 * The families that probably hold the person, by the rule of `matchesOf` read from the person: a
 * live head whose name is the person's father's or husband's name, in the person's union and
 * village, whose household now (the list of its application submitted last, as `currentMembers`
 * reads it: a list of no application or of a deleted one older than any, then the one written
 * last) holds a member with the person's name; only heads the viewer reaches, with every
 * relationship that list gives the person. The review's signal (`membersOf`) reads every active
 * row of a head and is left as it is.
 */
async function memberOfNow(tx: Tx, personId: string, scope: Scope): Promise<MemberOf[]> {
  const rows = await tx.$queryRaw<
    {
      id: string;
      ben_no: number;
      name: string;
      relationships: { code: string; bn: string | null; en: string | null }[];
    }[]
  >`
    WITH heads AS (
      SELECT DISTINCT x.id
      FROM beneficiaries me
      JOIN beneficiary_family_members m ON m.name_key = me.name_key AND m.active
      JOIN beneficiaries x ON x.id = m.beneficiary_id AND x.id <> me.id
        AND x.merged_into_id IS NULL
        AND x.name_key = me.guardian_key
        AND x.union_id = me.union_id AND x.village_key = me.village_key
      WHERE me.id = ${personId}::uuid AND ${beneficiaryReachedByAll([scope], 'x')}
    ),
    lists AS (
      SELECT m.beneficiary_id AS head_id, m.source_application_id AS source,
             max(a.submitted_at) AS submitted_at, max(m.created_at) AS written
      FROM beneficiary_family_members m
      LEFT JOIN applications a ON a.id = m.source_application_id AND a.status <> 'deleted'
      WHERE m.active AND m.beneficiary_id IN (SELECT id FROM heads)
      GROUP BY m.beneficiary_id, m.source_application_id
    ),
    newest AS (
      SELECT DISTINCT ON (head_id) head_id, source
      FROM lists ORDER BY head_id, submitted_at DESC NULLS LAST, written DESC
    )
    SELECT x.id, x.ben_no, x.name,
      COALESCE(
        jsonb_agg(DISTINCT jsonb_build_object(
          'code', m.relationship_code, 'bn', r.label_bn, 'en', r.label_en))
          FILTER (WHERE m.relationship_code IS NOT NULL),
        '[]'::jsonb) AS relationships
    FROM newest n
    JOIN beneficiaries me ON me.id = ${personId}::uuid
    JOIN beneficiary_family_members m ON m.beneficiary_id = n.head_id AND m.active
      AND m.source_application_id IS NOT DISTINCT FROM n.source AND m.name_key = me.name_key
    JOIN beneficiaries x ON x.id = n.head_id
    LEFT JOIN reference_lists r ON r.list_key = m.relationship_list AND r.code = m.relationship_code
    GROUP BY x.id, x.ben_no, x.name
    ORDER BY x.ben_no
    LIMIT ${MEMBER_OF_SHOWN}`;
  return rows.map((r) => ({
    head: { beneficiaryId: r.id, benNo: formatBenNo(r.ben_no), name: r.name },
    relationships: r.relationships
      .map((rel) => ({
        code: rel.code,
        name: rel.bn !== null && rel.en !== null ? { bn: rel.bn, en: rel.en } : null,
      }))
      .sort((a, b) => a.code.localeCompare(b.code)),
  }));
}

/** What the family received, or only how many helped members' profiles the viewer cannot open. */
export type FamilyHelp =
  (ReturnType<typeof helpView> & { people: number; notShown: number }) | { notShown: number };

export interface FamilySection {
  /** The members now; each id is in `links` where it probably has a profile the viewer reaches. */
  memberIds: Set<string>;
  links: Map<string, ProfileRef>;
  memberOf: MemberOf[];
  /**
   * What the family received where a member links to a profile the viewer reaches; only the count
   * of the others where none does; null where nothing is to tell or the viewer may not see help.
   */
  help: FamilyHelp | null;
}

/**
 * The family section of one profile, inside the profile's read. `members` are the person's active
 * rows; `own` the person's applications as the profile read them; `rows` the projects whose rows
 * the viewer sees in a profile (a project outside is counted, never named). The reads are a fixed
 * number whatever the size of the household: one for the matches, one for the families, one for
 * the left-behind applications and one for the applications of every linked profile.
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
  const [matches, memberOf] = await Promise.all([
    matchesOf(
      tx,
      input.headId,
      now.slice(0, FAMILY_LINKS_MAX).map((m) => m.id),
      input.scope,
    ),
    memberOfNow(tx, input.headId, input.scope),
  ]);
  const links = new Map<string, ProfileRef>();
  for (const m of matches)
    if (m.reached)
      links.set(m.member_id, { beneficiaryId: m.id, benNo: formatBenNo(m.ben_no), name: m.name });
  if (!input.seesHelp) return { memberIds, links, memberOf, help: null };
  // the profiles of the family: the ones the viewer reaches are summed, the others that were helped
  // are counted, each profile once whichever members chose it
  const linked = [...new Set(matches.filter((m) => m.reached).map((m) => m.id))];
  const notShown = new Set(matches.filter((m) => !m.reached && m.help_count > 0).map((m) => m.id))
    .size;
  if (!linked.length) return { memberIds, links, memberOf, help: notShown ? { notShown } : null };
  const left = await tx.$queryRaw<{ application_id: string }[]>`
    SELECT application_id FROM (${leftBehindSql(linked)}) AS l`;
  const applications = new Map(input.own.map((a) => [a.id, a]));
  for (const a of await personApplications(tx, {
    OR: [{ beneficiaryId: { in: linked } }, { id: { in: left.map((l) => l.application_id) } }],
  }))
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
