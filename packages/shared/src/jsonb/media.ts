import { z } from 'zod';

/** A code of a reference list: a stage, a production role, a platform, a consent channel. */
export const LIST_CODE = /^[a-z][a-z0-9_]{0,49}$/;

/**
 * `media_works.script` (docs/database/json-schemas/media-work-script.schema.json): the optional
 * parts of a work's script, each free text, counted in characters as the JSON Schema counts them,
 * so an emoji counts once.
 */
const part = z
  .string()
  .refine((s) => [...s].length <= 20000, { message: 'too_long' })
  .optional();
export const mediaScriptSchema = z.strictObject({
  summary: part,
  questions: part,
  scenes: part,
  voiceOver: part,
  notes: part,
});
export type MediaScript = z.infer<typeof mediaScriptSchema>;

/**
 * `reference_lists.attributes` (docs/database/json-schemas/reference-list-attributes.schema.json):
 * per list, what an entry carries beyond its labels; a media platform names its consent channel.
 */
export const referenceListAttributesSchema = z.strictObject({
  consent_channel: z.string().regex(LIST_CODE).optional(),
});
export type ReferenceListAttributes = z.infer<typeof referenceListAttributesSchema>;
