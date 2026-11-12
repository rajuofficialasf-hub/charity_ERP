import { DEFAULT_IDENTITY_RULES } from '@css/shared/projects';
import { describe, expect, it } from 'vitest';
import { myProjectDetailSchema, myProjectSchema } from './projects';
import { snapshotViewSchema } from './sync';

const PROJECT = {
  projectId: '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4c01',
  code: 'WC',
  year: 2026,
  name: { bn: 'শীতবস্ত্র', en: 'Winter' },
  status: 'active',
  applyFrom: null,
  applyTo: null,
  perVolunteerLimit: null,
  dawahEnabled: false,
  via: 'assignment',
  permissionSet: null,
  isPaid: false,
  consentStatus: 'accepted',
  rulesVersion: 1,
  applicationsCounted: 0,
  applicationsLeft: null,
  leadsTeam: false,
};
const LOOSE = {
  document: 'optional',
  mobile: 'optional',
  repeatPerson: 'tell',
  repeatFamily: 'tell',
};

describe('the identity rules of an own project', () => {
  it('read as the defaults in an answer that does not carry them', () => {
    expect(myProjectSchema.parse(PROJECT).identityRules).toEqual(DEFAULT_IDENTITY_RULES);
    expect(
      myProjectDetailSchema.parse({ ...PROJECT, rules: { version: 1, parts: [] } }).identityRules,
    ).toEqual(DEFAULT_IDENTITY_RULES);
    const snapshot = snapshotViewSchema.parse({
      serverTime: '2026-10-31T10:00:00.000Z',
      nextSince: '2026-10-31T09:59:00.000Z',
      nextAfterId: null,
      hasMore: false,
      projects: [PROJECT],
      formVersions: [],
      applications: [],
      applicationIds: [],
      locationsVersion: '12.a',
    });
    expect(snapshot.projects[0]!.identityRules).toEqual(DEFAULT_IDENTITY_RULES);
  });

  it('read as sent when the answer carries them, and a value outside the lists is refused', () => {
    expect(myProjectSchema.parse({ ...PROJECT, identityRules: LOOSE }).identityRules).toEqual(
      LOOSE,
    );
    expect(
      myProjectSchema.safeParse({ ...PROJECT, identityRules: { ...LOOSE, document: 'never' } })
        .success,
    ).toBe(false);
  });
});
