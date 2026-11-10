import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  formLibrarySchema,
  formVersionListItemSchema,
  formVersionRecordSchema,
  formVersionSchema,
  nisabInForceSchema,
  projectFormViewSchema,
  publicLinkSchema,
  readyFormViewSchema,
} from '../../src/api/schemas';
import { expectContract, expectEnvelope } from './support/expect';
import { type Caller, call, contractBase, signIn } from './support/session';
import {
  APPLICATION_SECTIONS,
  day,
  draftProject,
  MONITORING,
  must,
  PM_HUM,
  unread,
} from './support/world';

// The form builder of the admin area: the question library, a ready form built, published and
// placed on a project, its newer version taken by the project, a project's own form drafted and
// published with its versions, the public link switched on, and the nisab the preview compares
// with.
const text = (bn: string) => ({ bn, en: `${bn} (en)` });
const formKey = () => `contract_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
/** A nisab in Taka the preview may compare with. */
const NISAB = '95000.00';

/** Saves a draft version with the application questions and publishes it, as the builder does. */
async function savePublish(builder: Caller, versionId: string) {
  const read = expectEnvelope(
    await call(builder, 'GET', `/form-versions/${versionId}`),
    200,
    formVersionRecordSchema,
  );
  const saved = expectEnvelope(
    await call(
      builder,
      'PATCH',
      `/form-versions/${versionId}`,
      { sections: APPLICATION_SECTIONS, scoring: null },
      { 'If-Match': read.meta.etag },
    ),
    200,
    formVersionRecordSchema,
  );
  expect(saved.data.sections.length).toBeGreaterThan(0);
  const published = expectEnvelope(
    await call(builder, 'POST', `/form-versions/${versionId}/publish`, undefined, {
      'If-Match': saved.meta.etag,
    }),
    200,
    formVersionRecordSchema,
  );
  expect(published.data.status).toBe('published');
}

describe.skipIf(!contractBase())('the form builder', () => {
  it('builds and publishes a ready form, places it and takes its newer version', async () => {
    const builder = await signIn(MONITORING);
    const ready = expectContract(
      await call(builder, 'POST', '/ready-forms', {
        key: formKey(),
        title: text('চুক্তি আবেদন'),
        kind: 'beneficiary_application',
        source: { kind: 'blank' },
      }),
      201,
      readyFormViewSchema,
    );
    await savePublish(builder, ready.draftVersionId!);
    const readyForms = expectContract(
      await call(builder, 'GET', '/ready-forms'),
      200,
      z.array(readyFormViewSchema),
    );
    expect(readyForms.find((f) => f.id === ready.id)?.publishedVersionNo).toBe(1);

    const pm = await signIn(PM_HUM);
    const projectId = await draftProject(pm);
    expectContract(
      await call(pm, 'GET', `/ready-forms/${ready.id}/published`),
      200,
      formVersionSchema,
    );
    const placed = expectContract(
      await call(pm, 'POST', `/projects/${projectId}/forms/place`, {
        readyFormId: ready.id,
        key: 'default',
      }),
      201,
      projectFormViewSchema,
    );
    expect(placed.sourceVersionNo).toBe(1);

    const next = expectContract(
      await call(builder, 'POST', `/forms/${ready.id}/versions`),
      201,
      formVersionSchema,
    );
    expect(next.versionNo).toBe(2);
    await savePublish(builder, next.id);
    const projectForms = expectContract(
      await call(pm, 'GET', `/projects/${projectId}/forms`),
      200,
      z.array(projectFormViewSchema),
    );
    expect(projectForms.find((f) => f.id === placed.id)?.newerVersionNo).toBe(2);
    const taken = expectContract(
      await call(pm, 'POST', `/forms/${placed.id}/take-version`),
      200,
      projectFormViewSchema,
    );
    expect(taken.sourceVersionNo).toBe(2);
  });

  it('drafts a project’s own form, publishes it, lists its versions and opens the public link', async () => {
    const builder = await signIn(MONITORING);
    const pm = await signIn(PM_HUM);
    const projectId = await draftProject(pm);
    const form = expectContract(
      await call(builder, 'POST', `/projects/${projectId}/forms`, {
        key: 'default',
        title: text('চুক্তি প্রকল্পের আবেদন'),
        source: { kind: 'blank' },
      }),
      201,
      projectFormViewSchema,
    );
    await savePublish(builder, form.draftVersionId!);
    const versions = expectContract(
      await call(builder, 'GET', `/forms/${form.id}/versions`),
      200,
      z.array(formVersionListItemSchema),
    );
    expect(versions.map((v) => v.status)).toEqual(['published']);
    const link = expectContract(
      await call(pm, 'PATCH', `/projects/${projectId}/public-link`, {
        enabled: true,
        formId: form.id,
      }),
      200,
      publicLinkSchema,
    );
    expect(link.url).toContain('/apply/');
  });

  it('adds a question to the library and reads the library the builder picks from', async () => {
    const builder = await signIn(MONITORING);
    const { libraryFormId } = expectContract(
      await call(builder, 'GET', '/form-library'),
      200,
      formLibrarySchema,
    );
    // the library keeps one open draft: the one there, or a new one after the published version
    const versions = expectContract(
      await call(builder, 'GET', `/forms/${libraryFormId}/versions`),
      200,
      z.array(formVersionListItemSchema),
    );
    const draft =
      versions.find((v) => v.status === 'draft') ??
      expectContract(
        await call(builder, 'POST', `/forms/${libraryFormId}/versions`),
        201,
        formVersionSchema,
      );
    const read = expectEnvelope(
      await call(builder, 'GET', `/form-versions/${draft.id}`),
      200,
      formVersionRecordSchema,
    );
    const fieldKey = formKey();
    const saved = expectEnvelope(
      await call(
        builder,
        'PATCH',
        `/form-versions/${draft.id}`,
        {
          sections: [
            ...read.data.sections,
            {
              key: formKey(),
              librarySectionKey: null,
              title: text('চুক্তি অংশ'),
              visibility: 'volunteer',
              condition: null,
              fields: [
                {
                  fieldKey,
                  libraryFieldKey: null,
                  type: 'long_text',
                  label: text('চুক্তি প্রশ্ন'),
                  required: false,
                  standardColumn: null,
                  settings: {},
                  options: [],
                },
              ],
            },
          ],
          scoring: null,
        },
        { 'If-Match': read.meta.etag },
      ),
      200,
      formVersionRecordSchema,
    );
    expectEnvelope(
      await call(builder, 'POST', `/form-versions/${draft.id}/publish`, undefined, {
        'If-Match': saved.meta.etag,
      }),
      200,
      formVersionRecordSchema,
    );
    const library = expectContract(
      await call(builder, 'GET', '/form-library'),
      200,
      formLibrarySchema,
    );
    expect(library.fields.map((f) => f.key)).toContain(fieldKey);
  });

  it('reads the nisab in force for the preview', async () => {
    const pm = await signIn(PM_HUM);
    // the seed sets no nisab; a version from today is added unless a run before set one
    if ((await call(pm, 'GET', '/nisab-versions/in-force')).status === 404)
      must(
        await call(pm, 'POST', '/nisab-versions', {
          value: NISAB,
          effectiveFrom: day(0),
          basisNote: 'চুক্তি পরীক্ষা',
        }),
        201,
        'nisab',
        unread,
      );
    const nisab = expectContract(
      await call(pm, 'GET', '/nisab-versions/in-force'),
      200,
      nisabInForceSchema,
    );
    expect(Number(nisab.value)).toBeGreaterThan(0);
  });
});
