import { demoName, fakeNid } from '@css/shared';
import type { Tx } from '../../../src/core/prisma.service.js';
import { SEED_AT, type SeedContext, seedId } from '../../context.js';
import type { UnionRef } from '../demo/index.js';
import type { VolunteerListRow } from './volunteer-file.js';

/**
 * The department's own volunteers from a checked volunteer list: each an approved general volunteer
 * who signs in by mobile. What the list does not give carries a placeholder a reader recognises as
 * a sample: an NID of the reserved fake range (never a real person's), parents' names marked as
 * samples, and a home address spread over the divisions; the real details are edited in the app
 * later.
 */

/** Where the volunteers live until their own address is entered: a division to a union. */
export type VolunteerHome = UnionRef;

/** The first fake NID of the org set's volunteers, away from the demo set's own numbers. */
const NID_OFFSET = 50_000;

const volunteerUserId = (mobile: string) => seedId(`org-volunteer:${mobile}`);

/**
 * The sample home addresses, spread over the country: the divisions take turns, and within a
 * division each turn goes to the next district, so the volunteers in the order of their mobiles
 * live in different divisions and districts.
 */
export async function spreadVolunteerHomes(db: Tx): Promise<VolunteerHome[]> {
  const unions = await db.$queryRaw<
    (VolunteerHome & { division_code: string; district_code: string })[]
  >`
    SELECT dv.id AS division, d.id AS district, up.id AS upazila, u.id AS "union",
           dv.code AS division_code, d.code AS district_code
    FROM locations u
    JOIN locations up ON up.id = u.parent_id
    JOIN locations d ON d.id = up.parent_id
    JOIN locations dv ON dv.id = d.parent_id
    WHERE u.kind = 'union' AND u.active AND up.active AND d.active AND dv.active
    ORDER BY dv.code, d.code, up.code, u.code`;
  if (unions.length === 0)
    throw new Error('the volunteers need the locations: run pnpm db:load-locations first');
  // per division, its districts take turns: the first union of each district, then the second
  const divisions = new Map<string, Map<string, VolunteerHome[]>>();
  for (const { division_code, district_code, ...home } of unions) {
    const districts = divisions.get(division_code) ?? new Map<string, VolunteerHome[]>();
    divisions.set(division_code, districts);
    districts.set(district_code, [...(districts.get(district_code) ?? []), home]);
  }
  const inTurns = (lists: VolunteerHome[][]) => {
    const turns: VolunteerHome[] = [];
    for (let i = 0; lists.some((l) => i < l.length); i++)
      for (const l of lists) if (i < l.length) turns.push(l[i]!);
    return turns;
  };
  return inTurns([...divisions.values()].map((districts) => inTurns([...districts.values()])));
}

export async function seedOrgVolunteers(
  ctx: SeedContext,
  volunteers: VolunteerListRow[],
  options: { actor: string; homes: VolunteerHome[]; demoHash: string | null },
): Promise<void> {
  if (volunteers.length === 0) return;
  if (options.homes.length === 0)
    throw new Error('the volunteers need the locations: run pnpm db:load-locations first');
  // a mobile is one account: one held by an account this set did not make stops the whole run
  const taken = await ctx.db.user.findMany({
    where: { mobile: { in: volunteers.map((v) => v.mobile) } },
    select: { id: true, mobile: true },
  });
  for (const t of taken) {
    const row = volunteers.find((v) => v.mobile === t.mobile);
    if (row && t.id !== volunteerUserId(row.mobile))
      throw new Error(`volunteer list, line ${row.line}: the mobile belongs to another account`);
  }
  // a volunteer keeps the sample NID of their first run; a new one takes the next free number
  const kept = new Map(
    (
      await ctx.db.volunteer.findMany({
        where: { userId: { in: volunteers.map((v) => volunteerUserId(v.mobile)) } },
        select: { userId: true, nid: true },
      })
    ).map((r) => [r.userId, r.nid]),
  );
  const used = new Set(
    (await ctx.db.volunteer.findMany({ select: { nid: true } })).map((r) => r.nid),
  );
  let next = NID_OFFSET;
  const nidOf = (uid: string) => {
    const known = kept.get(uid);
    if (known) return known;
    while (used.has(fakeNid(next))) next++;
    const nid = fakeNid(next);
    used.add(nid);
    return nid;
  };
  const ordered = [...volunteers].sort((a, b) => a.mobile.localeCompare(b.mobile));
  for (const [i, v] of ordered.entries()) {
    const uid = volunteerUserId(v.mobile);
    const home = options.homes[i % options.homes.length]!;
    await ctx.upsert(
      'users',
      {
        id: uid,
        kind: 'volunteer',
        mobile: v.mobile,
        state: 'active',
        display_name: v.name,
        language: 'bn',
        ...ctx.audit(),
      },
      // a name or state changed in the app stays on a rerun
      { insertOnly: ['state', 'language', 'display_name'] },
    );
    await ctx.upsert('user_roles', {
      id: seedId(`user-role:${uid}:volunteer_general`),
      user_id: uid,
      role_key: 'volunteer_general',
      granted_by: options.actor,
      granted_at: SEED_AT,
    });
    await ctx.upsert(
      'volunteers',
      {
        id: seedId(`org-volunteer-row:${v.mobile}`),
        user_id: uid,
        nid: nidOf(uid),
        type: 'general',
        father_name: demoName('পিতার নাম'),
        mother_name: demoName('মাতার নাম'),
        division_id: home.division,
        district_id: home.district,
        upazila_id: home.upazila,
        union_id: home.union,
        approved_by: options.actor,
        approved_at: SEED_AT,
        ...ctx.audit(),
      },
      // the placeholders are written once; details edited in the app since stay
      {
        insertOnly: [
          'nid',
          'father_name',
          'mother_name',
          'division_id',
          'district_id',
          'upazila_id',
          'union_id',
          'type',
          'approved_by',
          'approved_at',
        ],
      },
    );
  }
  // the demo password opens an account only while it has no password of its own
  if (options.demoHash)
    await ctx.db.user.updateMany({
      where: { id: { in: volunteers.map((v) => volunteerUserId(v.mobile)) }, passwordHash: null },
      data: { passwordHash: options.demoHash, updatedBy: options.actor },
    });
}
