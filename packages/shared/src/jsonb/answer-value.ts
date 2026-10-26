import { z } from 'zod';
import { dateTime, unique } from './common.js';

// application_answers.value (docs/database/json-schemas/application-answer-value.schema.json):
// one typed answer per form field; the branch is chosen by `t`.
const text = z.strictObject({
  t: z.enum(['short_text', 'long_text', 'phone', 'email', 'signature_ref']),
  v: z.string().max(4000),
});
const number = z.strictObject({ t: z.enum(['number', 'decimal']), v: z.number() });
const money = z.strictObject({
  t: z.literal('money'),
  // bounded pattern copied from the JSON Schema; no catastrophic backtracking
  // eslint-disable-next-line security/detect-unsafe-regex
  v: z.string().regex(/^[0-9]{1,12}(\.[0-9]{1,2})?$/),
});
const date = z.strictObject({ t: z.literal('date'), v: z.iso.date() });
const time = z.strictObject({
  t: z.literal('time'),
  v: z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/),
});
const datetime = z.strictObject({ t: z.literal('datetime'), v: dateTime });
const singleChoice = z.strictObject({
  t: z.enum(['single_select', 'radio']),
  v: z.string().max(64),
  other: z.string().max(500).optional(),
});
const multiChoice = z.strictObject({
  t: z.enum(['multi_select', 'checkbox']),
  v: z.array(z.string().max(64)).refine(unique, 'items must be unique'),
  other: z.string().max(500).optional(),
});
const files = z.strictObject({ t: z.enum(['photo', 'file', 'signature']), v: z.array(z.uuid()) });
const gps = z.strictObject({
  t: z.literal('gps'),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracy_m: z.number().min(0).optional(),
  captured_at: dateTime.optional(),
});
const bdAddress = z.strictObject({
  t: z.literal('bd_address'),
  division_id: z.uuid(),
  district_id: z.uuid(),
  upazila_id: z.uuid(),
  union_id: z.uuid(),
  village: z.string().max(200).optional(),
});
/**
 * A number table: whole numbers by row and column key. The keys and the numbers are checked against
 * the question's own rows and columns by the validator, which keeps only those.
 */
const numberTable = z.strictObject({
  t: z.literal('number_table'),
  v: z.record(z.string(), z.record(z.string(), z.number())),
});
const calculated = z.strictObject({
  t: z.literal('calculation'),
  v: z.union([z.number(), z.string(), z.boolean()]),
  computed_at: dateTime.optional(),
});

export const answerValueSchema = z.union([
  text,
  number,
  money,
  date,
  time,
  datetime,
  singleChoice,
  multiChoice,
  files,
  gps,
  bdAddress,
  calculated,
  numberTable,
]);
export type AnswerValue = z.infer<typeof answerValueSchema>;
