import { answerValueSchema, uuidv7 } from '@css/shared';
import { FILE_KINDS, kindAllowedOn } from '@css/shared/files';
import {
  type Answer,
  type FormDefinition,
  identityColumn,
  validate,
  type ValidateOptions,
  type ValidationError,
} from '@css/shared/forms';
import { z } from 'zod';
import type { Tx } from '../core/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { ApiError } from '../i18n/api-error.js';
import type { NisabService } from '../services/nisab.js';

/** The standard column of the question that holds the NID or birth-registration number. */
export const IDENTITY_COLUMN = 'nid_or_birth_reg';

export type AddressChain = [string, string, string, string];

type Field = FormDefinition['sections'][number]['fields'][number];

const photoAnswerSchema = z.object({ t: z.literal('photo'), v: z.array(z.string()) });
const fileAnswerSchema = z.object({
  t: z.enum(['photo', 'file', 'signature']),
  v: z.array(z.string()),
});
const fileKindSchema = z.enum(FILE_KINDS);

/** The file ids every photo answer names, by field. */
export function photoAnswers(
  answers: { fieldKey: string; value: unknown }[],
): { fieldKey: string; fileIds: string[] }[] {
  return answers.flatMap((a) => {
    const photo = photoAnswerSchema.safeParse(a.value);
    return photo.success ? [{ fieldKey: a.fieldKey, fileIds: photo.data.v }] : [];
  });
}

/** The four address ids the engine split out of the answers, when all four are there. */
export function addressOf(standard: Record<string, unknown>): AddressChain | null {
  const ids = [
    standard.division_id,
    standard.district_id,
    standard.upazila_id,
    standard.union_id,
  ].map((id) => (typeof id === 'string' ? id : null));
  return ids.every((id): id is string => id !== null) ? (ids as AddressChain) : null;
}

/** The nisab in force today as the engine's option, or nothing while none is set. */
export async function nisabOption(
  nisab: NisabService,
  today: string,
): Promise<{ nisabValue?: string }> {
  try {
    return { nisabValue: (await nisab.inForceOn(today)).value };
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return {};
    throw error;
  }
}

/** Every question of a definition, whichever section holds it. */
export const fieldsOf = (definition: FormDefinition): Field[] =>
  definition.sections.flatMap((s) => s.fields);

/** The question marked with a standard column, if the form has one. */
export function fieldByColumn(definition: FormDefinition, column: string): Field | null {
  return fieldsOf(definition).find((f) => f.standardColumn === column) ?? null;
}

/**
 * An identity number as the server reads it everywhere: trimmed, and no number when nothing is
 * left. The guard of the send, the binding of the person and the comparison with the block list
 * all read it here, so an answer of only spaces is "no number" for each of them alike.
 */
export function identityNumber(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/** The identity number in the answer of the form's identity question, or null. */
export function identityNumberIn(
  definition: FormDefinition,
  answers: readonly { fieldKey: string; repeatIndex?: number | null; value: unknown }[],
): string | null {
  const field = fieldByColumn(definition, IDENTITY_COLUMN);
  if (!field) return null;
  const answer = answers.find((a) => a.fieldKey === field.fieldKey && (a.repeatIndex ?? 0) === 0);
  return identityNumber((answer?.value as { v?: unknown } | undefined)?.v);
}

/**
 * The identity number of an application's standard columns with the column it fills, or null. The
 * column is read from the trimmed number, so a number stored with spaces around it is still the
 * NID it is.
 */
export function identityOf(
  standard: Record<string, unknown>,
): { number: string; column: 'nid' | 'birth_reg' } | null {
  const number = identityNumber(standard.nid) ?? identityNumber(standard.birth_reg);
  return number ? { number, column: identityColumn(number) } : null;
}

/**
 * The name typed on an application, from its standard columns: kept on an entry that waits for
 * verification so the lists can name it before a profile exists; null when none was given.
 */
export function typedName(standard: Record<string, unknown>): string | null {
  const value = standard.name;
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/** The text an answer of a short question holds, trimmed, or null. */
export function textOf(answers: readonly Answer[], fieldKey: string): string | null {
  const answer = answers.find((a) => a.fieldKey === fieldKey && (a.repeatIndex ?? 0) === 0);
  const value = answer ? (answer.value as { v?: unknown }).v : undefined;
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/** The answers checked as the engine checks them; the refused ones are named one by one. */
export function checkAnswers(
  definition: FormDefinition,
  raw: readonly unknown[],
  options: ValidateOptions,
) {
  const checked = validate(definition, raw, options);
  if (!checked.ok) throw new ApiError('validation.failed', 422, undefined, checked.errors);
  return checked;
}

/**
 * Every file a photo, file or signature answer names must be the caller's own upload, or one
 * already linked to this application, and of a kind the record takes; otherwise an answer could
 * attach any file of the system to this application.
 */
export async function assertUploadsOwn(
  tx: Tx,
  actorId: string,
  applicationId: string | null,
  answers: readonly Answer[],
): Promise<void> {
  const named = answers.flatMap((a) => {
    const files = fileAnswerSchema.safeParse(a.value);
    return files.success ? files.data.v.map((id) => ({ fieldKey: a.fieldKey, id })) : [];
  });
  if (!named.length) return;
  const ids = [...new Set(named.map((n) => n.id))];
  const [files, links] = await Promise.all([
    tx.file.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: { id: true, kind: true, uploadedBy: true },
    }),
    applicationId
      ? tx.fileLink.findMany({
          where: { fileId: { in: ids }, entityType: 'application', entityId: applicationId },
          select: { fileId: true },
        })
      : [],
  ]);
  const byId = new Map(files.map((f) => [f.id, f]));
  const linked = new Set(links.map((l) => l.fileId));
  const errors: ValidationError[] = [];
  for (const { fieldKey, id } of named) {
    const file = byId.get(id);
    if (!file || (file.uploadedBy !== actorId && !linked.has(id)))
      errors.push({ path: fieldKey, code: 'application.upload_not_own' });
    else {
      const kind = fileKindSchema.safeParse(file.kind);
      if (!kind.success || !kindAllowedOn('application', kind.data))
        errors.push({ path: fieldKey, code: 'file.kind_not_allowed' });
    }
  }
  if (errors.length) throw new ApiError('validation.failed', 422, undefined, errors);
}

/** Replaces the stored answers of an application with these, by the fields of its version. */
export async function writeAnswers(
  tx: Tx,
  applicationId: string,
  versionId: string,
  answers: readonly Answer[],
  actorId: string,
): Promise<void> {
  const fields = new Map(
    (
      await tx.formField.findMany({
        where: { formVersionId: versionId },
        select: { id: true, fieldKey: true },
      })
    ).map((f) => [f.fieldKey, f.id]),
  );
  await tx.applicationAnswer.deleteMany({ where: { applicationId } });
  await tx.applicationAnswer.createMany({
    data: answers.flatMap((a) => {
      const fieldId = fields.get(a.fieldKey);
      return fieldId
        ? [
            {
              id: uuidv7(),
              applicationId,
              fieldId,
              repeatIndex: a.repeatIndex ?? 0,
              value: a.value as Prisma.InputJsonValue,
              createdBy: actorId,
              updatedBy: actorId,
            },
          ]
        : [];
    }),
  });
}

/**
 * The stored answers of an application, limited to the questions of the definition given (the
 * caller's audience never receives an official-only answer); each value is parsed, not trusted.
 */
export async function readAnswers(
  tx: Tx,
  applicationId: string,
  definition: FormDefinition,
): Promise<Answer[]> {
  const keys = new Set(fieldsOf(definition).map((f) => f.fieldKey));
  const rows = await tx.applicationAnswer.findMany({
    where: { applicationId },
    select: { repeatIndex: true, value: true, field: { select: { fieldKey: true } } },
    orderBy: [{ field: { fieldKey: 'asc' } }, { repeatIndex: 'asc' }],
  });
  return rows
    .filter((r) => keys.has(r.field.fieldKey))
    .map((r) => ({
      fieldKey: r.field.fieldKey,
      repeatIndex: r.repeatIndex,
      value: answerValueSchema.parse(r.value),
    }));
}

/** The answers that differ between two sets, by question and row: the change log of a review edit. */
export function changedAnswers(
  before: readonly Answer[],
  after: readonly Answer[],
): { fieldKey: string; repeatIndex: number; old: unknown; new: unknown }[] {
  const key = (a: Answer) => `${a.fieldKey}#${a.repeatIndex ?? 0}`;
  const was = new Map(before.map((a) => [key(a), a]));
  const now = new Map(after.map((a) => [key(a), a]));
  const changes: { fieldKey: string; repeatIndex: number; old: unknown; new: unknown }[] = [];
  for (const [k, a] of now) {
    const old = was.get(k);
    if (!old || JSON.stringify(old.value) !== JSON.stringify(a.value))
      changes.push({
        fieldKey: a.fieldKey,
        repeatIndex: a.repeatIndex ?? 0,
        old: old?.value ?? null,
        new: a.value,
      });
  }
  for (const [k, a] of was)
    if (!now.has(k))
      changes.push({
        fieldKey: a.fieldKey,
        repeatIndex: a.repeatIndex ?? 0,
        old: a.value,
        new: null,
      });
  return changes;
}
