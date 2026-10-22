import { componentSettingsSchemas } from '@css/shared';
import type { FormDefinition } from '@css/shared/forms';
import { isoDateInDhaka } from '@css/shared/format';
import type { Tx } from '../core/prisma.service';
import { ApiError } from '../i18n/api-error';

/** The field types the public cannot answer: an upload without a login exists for photos only. */
const NOT_ON_THE_LINK = new Set(['file', 'signature']);

/** Whether a definition's volunteer-visible part asks for a file or a signature. */
export function asksForFiles(definition: FormDefinition): boolean {
  return definition.sections.some(
    (s) => s.visibility === 'volunteer' && s.fields.some((f) => NOT_ON_THE_LINK.has(f.type)),
  );
}

/** A public link that takes applications now, with its published version. */
export interface OpenLink {
  token: string;
  projectId: string;
  name: { bn: string; en: string };
  applyTo: string | null;
  version: {
    id: string;
    formId: string;
    versionNo: number;
    status: string;
    publishedAt: Date | null;
  };
}

/**
 * The link a token opens, or 404 `public.link_closed` for every closed state alike (a disabled
 * link, a project that is not active or outside its application window, a form with no published
 * version), so a probe learns nothing.
 */
export async function resolveOpenLink(db: Tx, now: Date, token: string): Promise<OpenLink> {
  const closed = () => new ApiError('public.link_closed', 404);
  const component = await db.projectComponent.findFirst({
    where: {
      componentKey: 'public_link',
      enabled: true,
      settings: { path: ['token'], equals: token },
    },
    select: {
      projectId: true,
      settings: true,
      project: {
        select: { status: true, applyFrom: true, applyTo: true, nameBn: true, nameEn: true },
      },
    },
  });
  if (!component) throw closed();
  // the row was found by its token; what remains is whether the link is open
  const link = linkOf(component.settings);
  if (!link.enabled || !link.formId) throw closed();
  const { project } = component;
  if (project.status !== 'active') throw closed();
  const today = isoDateInDhaka(now);
  const applyFrom = project.applyFrom ? isoDateInDhaka(project.applyFrom) : null;
  const applyTo = project.applyTo ? isoDateInDhaka(project.applyTo) : null;
  if ((applyFrom && today < applyFrom) || (applyTo && applyTo < today)) throw closed();
  const published = await db.formVersion.findFirst({
    where: { formId: link.formId, status: 'published', form: { projectId: component.projectId } },
    select: { id: true, formId: true, versionNo: true, status: true, publishedAt: true },
  });
  if (!published) throw closed();
  return {
    token,
    projectId: component.projectId,
    name: { bn: project.nameBn, en: project.nameEn },
    applyTo,
    version: published,
  };
}

/** The link of a project as its settings hold it: enabled with a token and one form, or off. */
export function linkOf(settings: unknown): { enabled: boolean; token?: string; formId?: string } {
  const parsed = componentSettingsSchemas.public_link.safeParse(settings);
  if (!parsed.success || !parsed.data.enabled) return { enabled: false };
  return { enabled: true, token: parsed.data.token, formId: parsed.data.form_ids?.[0] };
}
