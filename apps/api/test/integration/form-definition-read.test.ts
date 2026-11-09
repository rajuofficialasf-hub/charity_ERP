import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readDefinition } from '../../src/services/forms';
import { authHarness, type AuthHarness } from './support/auth-app';
import * as f from './support/fixtures';

// The definition as each audience reads it: the points of the priority score are the office's,
// so a volunteer or a public-link visitor never learns which answer raises the score.
let h: AuthHarness;
let versionId: string;

beforeAll(async () => {
  h = await authHarness();
  const project = await f.project(h.db);
  versionId = project.formVersion;
  const section = await f.insert(h.db, 'form_sections', {
    id: randomUUID(),
    form_version_id: versionId,
    key: 'need',
    title_bn: 'প্রয়োজন',
    title_en: 'Need',
    sort_order: 0,
  });
  const field = await f.insert(h.db, 'form_fields', {
    id: randomUUID(),
    form_section_id: section,
    form_version_id: versionId,
    field_key: 'kind',
    type: 'radio',
    label_bn: 'ধরন',
    label_en: 'Kind',
    settings: JSON.stringify({
      help: { bn: 'একটি বাছুন', en: 'Pick one' },
      score: { options: { widow: 20 } },
    }),
    sort_order: 0,
  });
  await f.insert(h.db, 'field_options', {
    id: randomUUID(),
    form_field_id: field,
    code: 'widow',
    label_bn: 'বিধবা',
    label_en: 'Widow',
    sort_order: 0,
  });
});
afterAll(async () => h.close());

describe('the points of a form', () => {
  it('are read by the office and kept from the volunteer, the rest of the settings shown to both', async () => {
    const office = await readDefinition(h.container.prisma, versionId, 'official');
    expect(office.sections[0]!.fields[0]!.settings).toEqual({
      help: { bn: 'একটি বাছুন', en: 'Pick one' },
      score: { options: { widow: 20 } },
    });
    const volunteer = await readDefinition(h.container.prisma, versionId, 'volunteer');
    expect(volunteer.sections[0]!.fields[0]!.settings).toEqual({
      help: { bn: 'একটি বাছুন', en: 'Pick one' },
    });
  });
});
