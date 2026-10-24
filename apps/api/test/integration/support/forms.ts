import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { expect } from 'vitest';
import type { AuthHarness, Session } from './auth-app';
import { bearer } from './auth-app';

const option = (code: string) => ({
  code,
  label: { bn: code, en: code },
  dependsOnOptionCode: null,
  allowsOtherText: false,
});

/** One question of a definition, a short text by default. */
export const question = (fieldKey: string, type: string, extra: Record<string, unknown> = {}) => ({
  fieldKey,
  libraryFieldKey: null,
  type,
  label: { bn: 'প্রশ্ন', en: 'Question' },
  required: false,
  standardColumn: null,
  settings: {},
  options: [],
  ...extra,
});

/** The seven identity questions, each marked by its column under a key of the builder's own. */
export const IDENTITY = [
  question('q_id', 'short_text', { required: true, standardColumn: 'nid_or_birth_reg' }),
  question('q_name', 'short_text', { required: true, standardColumn: 'name' }),
  question('q_father', 'short_text', { required: true, standardColumn: 'father_or_husband_name' }),
  question('q_mobile', 'phone', { required: true, standardColumn: 'mobile' }),
  question('q_gender', 'single_select', {
    required: true,
    standardColumn: 'gender_code',
    options: [option('male'), option('female')],
  }),
  question('q_address', 'bd_address', {
    required: true,
    standardColumn: 'division_id,district_id,upazila_id,union_id',
  }),
  question('q_village', 'short_text', { required: true, standardColumn: 'village' }),
];

/** A section seen by everyone, holding these questions. */
export const section = (fields: unknown[], key = 'section_1') => ({
  key,
  librarySectionKey: null,
  title: { bn: 'অংশ', en: 'Section' },
  visibility: 'volunteer',
  condition: null,
  fields,
});

/**
 * A ready form, published: the identity questions and a note for an application form, the note
 * alone for a form of another kind. Answers the ready form's id.
 */
export async function publishedReadyForm(
  h: AuthHarness,
  builder: Session,
  kind: 'beneficiary_application' | 'other' = 'beneficiary_application',
): Promise<string> {
  const api = () => request(h.server());
  const made = await api()
    .post('/api/v1/ready-forms')
    .set(bearer(builder))
    .send({
      key: `ready_${randomUUID().slice(0, 8)}`,
      title: { bn: 'আবেদন', en: 'Application' },
      kind,
      source: { kind: 'blank' },
    });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  const draftId = made.body.data.draftVersionId as string;
  const etag = async () =>
    (await api().get(`/api/v1/form-versions/${draftId}`).set(bearer(builder))).headers
      .etag as string;
  const fields = [
    ...(kind === 'beneficiary_application' ? IDENTITY : []),
    question('q_note', 'long_text'),
  ];
  const saved = await api()
    .patch(`/api/v1/form-versions/${draftId}`)
    .set(bearer(builder))
    .set('If-Match', await etag())
    .send({ sections: [section(fields)] });
  expect(saved.status, JSON.stringify(saved.body)).toBe(200);
  const published = await api()
    .post(`/api/v1/form-versions/${draftId}/publish`)
    .set(bearer(builder))
    .set('If-Match', await etag());
  expect(published.status, JSON.stringify(published.body)).toBe(200);
  return made.body.data.id as string;
}

/**
 * A project's application form, published: a ready form with the identity questions built and
 * published by `builder` (the Monitoring Team or the Department Head), then placed on the project
 * by the same session. What a project needs before it can be activated, and what a template or a
 * copy carries along.
 */
export async function publishedForm(
  h: AuthHarness,
  builder: Session,
  projectId: string,
): Promise<{ formId: string; versionId: string }> {
  const api = () => request(h.server());
  const readyFormId = await publishedReadyForm(h, builder);
  const placed = await api()
    .post(`/api/v1/projects/${projectId}/forms/place`)
    .set(bearer(builder))
    .send({ readyFormId, key: 'default' });
  expect(placed.status, JSON.stringify(placed.body)).toBe(201);
  return {
    formId: placed.body.data.id as string,
    versionId: placed.body.data.publishedVersionId as string,
  };
}
