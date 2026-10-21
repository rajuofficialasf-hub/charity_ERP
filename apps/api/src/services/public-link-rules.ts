import { componentSettingsSchemas } from '@css/shared';
import type { FormDefinition } from '@css/shared/forms';

/** The field types the public cannot answer: an upload without a login exists for photos only. */
const NOT_ON_THE_LINK = new Set(['file', 'signature']);

/** Whether a definition's volunteer-visible part asks for a file or a signature. */
export function asksForFiles(definition: FormDefinition): boolean {
  return definition.sections.some(
    (s) => s.visibility === 'volunteer' && s.fields.some((f) => NOT_ON_THE_LINK.has(f.type)),
  );
}

/** The link of a project as its settings hold it: enabled with a token and one form, or off. */
export function linkOf(settings: unknown): { enabled: boolean; token?: string; formId?: string } {
  const parsed = componentSettingsSchemas.public_link.safeParse(settings);
  if (!parsed.success || !parsed.data.enabled) return { enabled: false };
  return { enabled: true, token: parsed.data.token, formId: parsed.data.form_ids?.[0] };
}
