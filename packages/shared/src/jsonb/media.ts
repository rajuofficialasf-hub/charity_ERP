import { z } from 'zod';

/**
 * `media_works.script` (docs/database/json-schemas/media-work-script.schema.json): the optional
 * parts of a work's script, each free text.
 */
const part = z.string().max(20000).optional();
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
  consent_channel: z
    .string()
    .regex(/^[a-z][a-z0-9_]{0,49}$/)
    .optional(),
});
export type ReferenceListAttributes = z.infer<typeof referenceListAttributesSchema>;
