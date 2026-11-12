import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { createContainer, closeContainer, type Container } from '../../src/container.js';
import { testEnv } from '../support/env.js';
import { cloneTemplate } from './support/db.js';
import * as f from './support/fixtures.js';

// The family-duplicate warning: other beneficiaries of the same project with the same mobile, or
// the same union, village and father's or husband's name. It only warns, never refuses.
let db: Client;
let drop: () => Promise<void>;
let container: Container;
let loc: Awaited<ReturnType<typeof f.locationTree>>;
let project: Awaited<ReturnType<typeof f.project>>;

beforeAll(async () => {
  const clone = await cloneTemplate(inject('templateDb'));
  ({ client: db, drop } = clone);
  container = createContainer(testEnv({ DATABASE_URL: clone.url }));
  loc = await f.locationTree(db);
  project = await f.project(db);
});
afterAll(async () => {
  await closeContainer(container);
  await drop();
});

const applicantIn = async (
  p: Awaited<ReturnType<typeof f.project>>,
  over: Record<string, unknown>,
  status = 'submitted',
) => {
  const id = await f.beneficiary(db, loc, over);
  await f.application(
    db,
    { project: p, loc },
    { beneficiary_id: id, status, ...(status === 'deleted' ? { deleted_at: new Date() } : {}) },
  );
  return id;
};
const matches = (beneficiaryId: string, projectId = project.id) =>
  container.prisma.$transaction((tx) =>
    container.beneficiaryFamily.matches(tx, projectId, beneficiaryId),
  );
const benNo = async (id: string) =>
  `BEN-${String((await db.query('SELECT ben_no FROM beneficiaries WHERE id = $1', [id])).rows[0].ben_no).padStart(7, '0')}`;

describe('the family-duplicate warning', () => {
  it('matches two applicants with one mobile, wherever they live', async () => {
    const other = await f.locationTree(db);
    const a = await applicantIn(project, { mobile: '01611000001', village: 'প্রথম গ্রাম' });
    const bId = await f.beneficiary(db, other, { mobile: '01611000001', village: 'অন্য গ্রাম' });
    await f.application(db, { project, loc: other }, { beneficiary_id: bId });
    expect(await matches(a)).toEqual([
      {
        beneficiaryId: bId,
        benNo: await benNo(bId),
        name: 'নমুনা উপকারভোগী',
        matchedOn: ['mobile'],
      },
    ]);
  });

  it('matches the same union, village and father, comparing names without extra spaces', async () => {
    const a = await applicantIn(project, {
      village: 'পূর্ব পাড়া',
      father_or_husband_name: 'আব্দুল করিম',
    });
    const b = await applicantIn(project, {
      village: ' পূর্ব  পাড়া ',
      father_or_husband_name: 'আব্দুল  করিম',
      name: 'রহিমা বেগম',
    });
    expect(await matches(a)).toEqual([
      {
        beneficiaryId: b,
        benNo: await benNo(b),
        name: 'রহিমা বেগম',
        matchedOn: ['union_village_father'],
      },
    ]);
  });

  it('names both rules when both match', async () => {
    const a = await applicantIn(project, {
      mobile: '01611000003',
      village: 'মধ্য পাড়া',
      father_or_husband_name: 'জব্বার',
    });
    const b = await applicantIn(project, {
      mobile: '01611000003',
      village: 'মধ্য পাড়া',
      father_or_husband_name: 'জব্বার',
    });
    expect((await matches(a)).map((m) => [m.beneficiaryId, m.matchedOn])).toEqual([
      [b, ['mobile', 'union_village_father']],
    ]);
  });

  it('does not match the same village with another father, nor another project', async () => {
    const a = await applicantIn(project, {
      village: 'দক্ষিণ পাড়া',
      father_or_husband_name: 'রফিক',
      mobile: '01611000004',
    });
    await applicantIn(project, {
      village: 'দক্ষিণ পাড়া',
      father_or_husband_name: 'শফিক',
      mobile: '01611000005',
    });
    const elsewhere = await f.project(db);
    await applicantIn(elsewhere, { mobile: '01611000004' });
    expect(await matches(a)).toEqual([]);
  });

  it('treats a missing mobile as no match, and answers the other rule without it', async () => {
    const elsewhere = await f.project(db);
    // two people reached through their volunteer, of different families
    const alone = await applicantIn(elsewhere, { mobile: null, village: 'উত্তর চর' });
    await applicantIn(elsewhere, { mobile: null, village: 'দক্ষিণ চর' });
    // a person with a number beside them matches neither
    await applicantIn(elsewhere, { mobile: '01611000007', village: 'পশ্চিম চর' });
    expect(await matches(alone, elsewhere.id)).toEqual([]);
    // the same family, both without a mobile: matched by the family rule alone
    const family = { mobile: null, village: 'মাঝের চর', father_or_husband_name: 'হাশেম' };
    const first = await applicantIn(elsewhere, family);
    const second = await applicantIn(elsewhere, family);
    const found = await matches(first, elsewhere.id);
    expect(found.map((m) => [m.beneficiaryId, m.matchedOn])).toEqual([
      [second, ['union_village_father']],
    ]);
  });

  it('reads a missing mobile as no shared mobile, never as unknown, when one of the two has none', async () => {
    const elsewhere = await f.project(db);
    const family = { village: 'নতুন চর', father_or_husband_name: 'কাশেম' };
    const without = await applicantIn(elsewhere, { ...family, mobile: null });
    const withMobile = await applicantIn(elsewhere, { ...family, mobile: '01611000008' });
    // from either side the family rule alone: a mobile compared with a missing one is no match
    for (const [me, other] of [
      [without, withMobile],
      [withMobile, without],
    ] as const) {
      const found = await matches(me, elsewhere.id);
      expect(found).toEqual([
        {
          beneficiaryId: other,
          benNo: await benNo(other),
          name: expect.any(String),
          matchedOn: ['union_village_father'],
        },
      ]);
    }
  });

  it('ignores deleted applications and retired profiles', async () => {
    const a = await applicantIn(project, { mobile: '01611000006' });
    await applicantIn(project, { mobile: '01611000006' }, 'deleted');
    const retired = await applicantIn(project, { mobile: '01611000006' });
    const kept = await f.beneficiary(db, loc);
    await db.query('UPDATE beneficiaries SET merged_into_id = $2 WHERE id = $1', [retired, kept]);
    expect(await matches(a)).toEqual([]);
  });
});
