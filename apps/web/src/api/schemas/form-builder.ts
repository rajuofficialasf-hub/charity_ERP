import { FIELD_TYPES, formFieldSchema } from '@css/shared/forms';
import { z } from 'zod';
import { bilingual, dateTime, versionedOf } from './common';
import { formDefinitionShape } from './forms';

/** A form version as the API answers it: its state and its definition. */
export const formVersionSchema = z.object({
  id: z.uuid(),
  formId: z.uuid(),
  versionNo: z.number().int(),
  status: z.enum(['draft', 'published', 'retired']),
  publishedAt: dateTime.nullable(),
  ...formDefinitionShape,
});
export type FormVersion = z.infer<typeof formVersionSchema>;

/** A version with its version tag, for the If-Match of the next save or the publish. */
export const formVersionRecordSchema = versionedOf(formVersionSchema);
export type FormVersionRecord = z.infer<typeof formVersionRecordSchema>;

/** A version as the version list gives it: also who published it and who changed it last. */
export const formVersionListItemSchema = formVersionSchema.extend({
  publishedBy: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  updatedBy: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  updatedAt: dateTime,
});
export type FormVersionListItem = z.infer<typeof formVersionListItemSchema>;

/** A section of the question library and the questions it places. */
export const librarySectionViewSchema = z.object({
  key: z.string(),
  title: bilingual,
  defaultVisibility: z.string(),
  fieldKeys: z.array(z.string()),
});
export type LibrarySectionView = z.infer<typeof librarySectionViewSchema>;

/** The question library the builder picks from, each question ready to place in a form. */
export const formLibrarySchema = z.object({
  /** The library form the Monitoring Team and the Department Head edit in the builder. */
  libraryFormId: z.uuid(),
  sections: z.array(librarySectionViewSchema),
  fields: z.array(
    z.object({
      key: z.string(),
      type: z.enum(FIELD_TYPES),
      label: bilingual,
      standardColumn: z.string().nullable(),
      formFields: z.array(formFieldSchema),
    }),
  ),
  templates: z.array(z.object({ key: z.string(), name: bilingual, projectType: z.string() })),
});
export type FormLibrary = z.infer<typeof formLibrarySchema>;

/** What a form is for: the identity marks and the public link apply to an application form. */
export const formKindSchema = z.enum(['beneficiary_application', 'other']);
export type FormKind = z.infer<typeof formKindSchema>;

/** A form of a project (`GET /projects/{id}/forms`). */
export const projectFormViewSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  key: z.string(),
  title: bilingual,
  kind: formKindSchema,
  publishedVersionId: z.uuid().nullable(),
  draftVersionId: z.uuid().nullable(),
  /** The ready form this form was placed from, and the version of it the project holds. */
  sourceFormId: z.uuid().nullable(),
  sourceVersionNo: z.number().int().nullable(),
  /** The ready form's newer published version, which the PM may take. */
  newerVersionNo: z.number().int().nullable(),
});
export type ProjectFormView = z.infer<typeof projectFormViewSchema>;

/** A ready form outside the projects (`GET /ready-forms`). */
export const readyFormViewSchema = z.object({
  id: z.uuid(),
  key: z.string(),
  kind: formKindSchema,
  title: bilingual,
  publishedVersionId: z.uuid().nullable(),
  publishedVersionNo: z.number().int().nullable(),
  draftVersionId: z.uuid().nullable(),
});
export type ReadyFormView = z.infer<typeof readyFormViewSchema>;

/** The nisab in force today, for the preview's zakat comparison. */
export const nisabInForceSchema = z.object({ value: z.string() });
export type NisabInForce = z.infer<typeof nisabInForceSchema>;

/** The project's public link: on with one form and its address, or off. */
export const publicLinkSchema = z.object({
  enabled: z.boolean(),
  formId: z.uuid().nullable(),
  url: z.string().nullable(),
});
export type PublicLink = z.infer<typeof publicLinkSchema>;
