import { calculationSchema, conditionSchema, uuidv7 } from '@css/shared';
import {
  blankDefinition,
  definitionFromTemplate,
  type FieldOption,
  fieldLogicSchema,
  fieldSettingsSchema,
  type FormCreate,
  type FormDefinition,
  type FormFieldDefinition,
  formDefinitionSchema,
  type FormSectionDefinition,
  formTemplateFormSchema,
} from '@css/shared/forms';
import type { MessageParams } from '@css/shared/i18n';
import { editableIn, PROJECT_STATUSES, type ProjectStatus } from '@css/shared/projects';
import { z } from 'zod';
import type { AccessService } from '../access/service';
import type { AuditWriter } from '../audit/audit-writer';
import { assertIfMatch } from '../core/etag';
import type { PrismaService, Tx } from '../core/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import { isUniqueViolation } from '../core/db-errors';
import { ApiError, type ApiErrorDetail } from '../i18n/api-error';
import { fieldTypeOf, type FormLibraryService, visibilityOf } from './form-library';
import type { ProjectViewer, ProjectsService } from './projects';

/** Who reads a version: an official sees every section, the others the volunteer-visible ones. */
export type FormAudience = 'official' | 'volunteer';

export interface FormView {
  id: string;
  projectId: string;
  key: string;
  title: { bn: string; en: string };
  publishedVersionId: string | null;
  draftVersionId: string | null;
}

export interface FormVersionView extends FormDefinition {
  id: string;
  formId: string;
  versionNo: number;
  status: string;
  publishedAt: string | null;
}

const VERSION_SELECT = {
  id: true,
  formId: true,
  versionNo: true,
  status: true,
  publishedAt: true,
  updatedAt: true,
  form: { select: { projectId: true } },
} as const;

/**
 * The engine's verdict on a definition as a 422: each problem names the field it is about (the
 * key the body gives at that place, or the one the engine names) and its catalogue code.
 */
function parseDefinition(body: unknown): FormDefinition {
  const parsed = formDefinitionSchema.safeParse(body);
  if (parsed.success) return parsed.data;
  const outline = bodyOutlineSchema.safeParse(body);
  const sections = outline.success ? outline.data.sections : [];
  const details: ApiErrorDetail[] = parsed.error.issues.map((issue) => {
    const params = issueParamsSchema.parse(issue).params ?? {};
    const [, i, , j] = issue.path;
    const section = typeof i === 'number' ? sections[i] : undefined;
    const field = typeof j === 'number' ? section?.fields[j] : undefined;
    const fieldKey =
      typeof params.fieldKey === 'string'
        ? params.fieldKey
        : (field?.fieldKey ?? section?.key ?? issue.path.map(String).join('.'));
    const code = issue.message.startsWith('form.') ? issue.message : 'validation.failed';
    const named: MessageParams = {};
    for (const [key, value] of Object.entries(params))
      if (typeof value === 'string' || typeof value === 'number') named[key] = value;
    return { path: fieldKey, code, ...(Object.keys(named).length ? { params: named } : {}) };
  });
  throw new ApiError('validation.failed', 422, undefined, details);
}

/** The keys of a draft body, read to name the field each refusal is about. */
const bodyOutlineSchema = z.looseObject({
  sections: z.array(
    z.looseObject({
      key: z.string().optional(),
      fields: z.array(z.looseObject({ fieldKey: z.string().optional() })).default([]),
    }),
  ),
});
/** The parameters the engine attaches to an issue (zod keeps them outside its typed shape). */
const issueParamsSchema = z.looseObject({ params: z.record(z.string(), z.unknown()).optional() });

/** The part of a stored form template the builder reads. */
const storedTemplateSchema = z.looseObject({ form: formTemplateFormSchema });

const FORM_SELECT = {
  id: true,
  projectId: true,
  key: true,
  titleBn: true,
  titleEn: true,
  formVersionsForm: {
    where: { status: { in: ['published', 'draft'] } },
    select: { id: true, status: true },
  },
} satisfies Prisma.FormSelect;
type FormRow = Prisma.FormGetPayload<{ select: typeof FORM_SELECT }>;

/** A typed value for a Prisma Json column (the engine's schemas already shaped it). */
const json = (value: unknown) => value as Prisma.InputJsonValue;

/** A project status read from the database, checked against the known states. */
function statusOf(value: string): ProjectStatus {
  const status = PROJECT_STATUSES.find((s) => s === value);
  if (!status) throw new Error(`unknown project status ${value}`);
  return status;
}

/**
 * The forms of a project and their versions (docs/MASTER_SPEC.md, the dynamic form platform; the
 * decisions on templates and form versions in docs/DECISION_LOG.md): a form starts
 * as draft 1 from a library template, blank with the mandatory core, or copied from another
 * project's published form; every read maps the stored rows to the one definition shape the
 * engine, the builder and the phone share, and keeps official-only sections from callers who may
 * not see them. Every write runs inside the caller's project scope.
 */
export class FormsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditWriter,
    private readonly access: AccessService,
    private readonly projects: ProjectsService,
    private readonly library: FormLibraryService,
  ) {}

  async list(viewer: ProjectViewer, projectId: string): Promise<FormView[]> {
    await this.projects.get(viewer, projectId);
    const rows = await this.prisma.form.findMany({
      where: { projectId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: FORM_SELECT,
    });
    return rows.map(formView);
  }

  async versions(viewer: ProjectViewer, formId: string): Promise<FormVersionView[]> {
    const form = await this.reachableForm(viewer, formId);
    const audience = await this.audienceOf(viewer, form.projectId);
    const rows = await this.prisma.formVersion.findMany({
      where: { formId },
      orderBy: { versionNo: 'asc' },
      select: VERSION_SELECT,
    });
    return Promise.all(
      rows.map(async (r) => versionView(r, await readDefinition(this.prisma, r.id, audience))),
    );
  }

  async read(
    viewer: ProjectViewer,
    versionId: string,
  ): Promise<{ version: FormVersionView; updatedAt: Date }> {
    const row = await this.prisma.formVersion.findUnique({
      where: { id: versionId },
      select: VERSION_SELECT,
    });
    if (!row) throw new ApiError('permission.not_found', 404);
    await this.projects.get(viewer, row.form.projectId);
    const audience = await this.audienceOf(viewer, row.form.projectId);
    return {
      version: versionView(row, await readDefinition(this.prisma, row.id, audience)),
      updatedAt: row.updatedAt,
    };
  }

  /**
   * A new form of a project as draft 1, from a template, blank or a copy; the project's
   * application-form component then names it. The project must still take setup changes.
   */
  async create(viewer: ProjectViewer, projectId: string, body: FormCreate): Promise<FormView> {
    const actor = viewer.principal.userId;
    return this.prisma.$transaction(async (tx) => {
      const project = await this.projects.locked(tx, viewer, projectId);
      if (!editableIn(statusOf(project.status), 'components'))
        throw new ApiError('project.read_only', 409);
      const taken = await tx.form.findFirst({
        where: { projectId, key: body.key },
        select: { id: true },
      });
      if (taken) throw new ApiError('form.key_taken', 409);
      const definition = await this.sourceDefinition(tx, viewer, body);
      const { formId, versionId } = await createFormFromDefinition(
        tx,
        projectId,
        { key: body.key, title: body.title, definition },
        actor,
      );
      await this.audit.record(tx, {
        action: 'form.created',
        entityType: 'form',
        entityId: formId,
        new: { projectId, key: body.key, source: body.source.kind, versionId },
      });
      const row = await tx.form.findUniqueOrThrow({ where: { id: formId }, select: FORM_SELECT });
      return formView(row);
    });
  }

  /**
   * Replaces the sections, fields and options of a draft with the body, after the engine accepts
   * it; a field keeps its row id when its key stays, so nothing that points at it is orphaned.
   */
  async updateDraft(
    viewer: ProjectViewer,
    versionId: string,
    body: { sections: unknown },
    ifMatch: string | undefined,
  ): Promise<{ version: FormVersionView; updatedAt: Date }> {
    const actor = viewer.principal.userId;
    return this.prisma.$transaction(async (tx) => {
      const row = await this.lockedDraft(tx, viewer, versionId);
      // a builder who cannot see the official-only sections would drop them with every save
      if ((await this.audienceOf(viewer, row.form.projectId)) !== 'official') {
        this.access.denied(viewer.principal.userId, viewer.scope.permission, viewer.scope.entity);
        throw new ApiError('permission.denied', 403);
      }
      assertIfMatch(ifMatch, row.updatedAt);
      const definition = parseDefinition(body);
      const kept = new Map(
        (
          await tx.formField.findMany({
            where: { formVersionId: versionId },
            select: { id: true, fieldKey: true },
          })
        ).map((x) => [x.fieldKey, x.id]),
      );
      await tx.fieldOption.deleteMany({ where: { formField: { formVersionId: versionId } } });
      await tx.formField.deleteMany({ where: { formVersionId: versionId } });
      await tx.formSection.deleteMany({ where: { formVersionId: versionId } });
      await writeDefinitionRows(tx, versionId, definition, actor, kept);
      const updated = await tx.formVersion.update({
        where: { id: versionId },
        data: { updatedBy: actor, updatedAt: new Date() },
        select: VERSION_SELECT,
      });
      await this.audit.record(tx, {
        action: 'form.draft_changed',
        entityType: 'form_version',
        entityId: versionId,
        new: {
          formId: row.formId,
          versionNo: row.versionNo,
          sections: definition.sections.map((s) => ({
            key: s.key,
            fields: s.fields.map((x) => x.fieldKey),
          })),
        },
      });
      return {
        version: versionView(updated, await readDefinition(tx, versionId, 'official')),
        updatedAt: updated.updatedAt,
      };
    });
  }

  /**
   * Publishes a draft: the stored definition must still pass the engine, the published sibling is
   * retired first (one published version per form), then the draft gets its stamp.
   */
  async publish(
    viewer: ProjectViewer,
    versionId: string,
    ifMatch: string | undefined,
  ): Promise<{ version: FormVersionView; updatedAt: Date }> {
    const actor = viewer.principal.userId;
    return this.prisma.$transaction(async (tx) => {
      const row = await this.lockedDraft(tx, viewer, versionId);
      assertIfMatch(ifMatch, row.updatedAt);
      const definition = await readDefinition(tx, versionId, 'official');
      parseDefinition(definition);
      const audience = await this.audienceOf(viewer, row.form.projectId);
      await tx.formVersion.updateMany({
        where: { formId: row.formId, status: 'published' },
        data: { status: 'retired', updatedBy: actor },
      });
      const now = new Date();
      const published = await tx.formVersion.update({
        where: { id: versionId },
        data: { status: 'published', publishedAt: now, publishedBy: actor, updatedBy: actor },
        select: VERSION_SELECT,
      });
      await this.audit.record(tx, {
        action: 'form.publish',
        entityType: 'form_version',
        entityId: versionId,
        new: { formId: row.formId, versionNo: row.versionNo },
      });
      return {
        version: versionView(
          published,
          audience === 'official' ? definition : await readDefinition(tx, versionId, audience),
        ),
        updatedAt: published.updatedAt,
      };
    });
  }

  /** The next draft of a form, as a copy of its published version; one draft at a time. */
  async createDraft(
    viewer: ProjectViewer,
    formId: string,
  ): Promise<{ version: FormVersionView; updatedAt: Date }> {
    const actor = viewer.principal.userId;
    return this.prisma.$transaction(async (tx) => {
      const form = await tx.form.findUnique({
        where: { id: formId },
        select: {
          projectId: true,
          formVersionsForm: { select: { id: true, status: true, versionNo: true } },
        },
      });
      if (!form) throw new ApiError('permission.not_found', 404);
      const project = await this.projects.locked(tx, viewer, form.projectId);
      if (!editableIn(statusOf(project.status), 'components'))
        throw new ApiError('project.read_only', 409);
      if (form.formVersionsForm.some((v) => v.status === 'draft'))
        throw new ApiError('form.draft_exists', 409);
      const published = form.formVersionsForm.find((v) => v.status === 'published');
      if (!published) throw new ApiError('form.nothing_published', 409);
      const versionNo = Math.max(...form.formVersionsForm.map((v) => v.versionNo)) + 1;
      const versionId = uuidv7();
      try {
        await tx.formVersion.create({
          data: { id: versionId, formId, versionNo, createdBy: actor, updatedBy: actor },
        });
      } catch (error) {
        // the one-draft index refuses a draft opened at the same moment by another request
        if (isUniqueViolation(error)) throw new ApiError('form.draft_exists', 409);
        throw error;
      }
      const definition = await readDefinition(tx, published.id, 'official');
      await writeDefinitionRows(tx, versionId, definition, actor);
      const audience = await this.audienceOf(viewer, form.projectId);
      await this.audit.record(tx, {
        action: 'form.version_created',
        entityType: 'form',
        entityId: formId,
        new: { versionId, versionNo, copiedFrom: published.id },
      });
      const row = await tx.formVersion.findUniqueOrThrow({
        where: { id: versionId },
        select: VERSION_SELECT,
      });
      return {
        version: versionView(
          row,
          audience === 'official' ? definition : await readDefinition(tx, versionId, audience),
        ),
        updatedAt: row.updatedAt,
      };
    });
  }

  /** Every field of a form by key, with the versions it appears in, for reports across versions. */
  async fieldMap(viewer: ProjectViewer, formId: string) {
    const form = await this.reachableForm(viewer, formId);
    const audience = await this.audienceOf(viewer, form.projectId);
    const rows = await this.prisma.formField.findMany({
      where: {
        formVersion: { formId },
        ...(audience === 'official' ? {} : { formSection: { visibility: 'volunteer' } }),
      },
      orderBy: [{ formVersion: { versionNo: 'asc' } }, { sortOrder: 'asc' }],
      select: {
        fieldKey: true,
        type: true,
        labelBn: true,
        labelEn: true,
        standardColumn: true,
        formVersion: { select: { versionNo: true } },
      },
    });
    const byKey = new Map<
      string,
      {
        fieldKey: string;
        type: string;
        label: { bn: string; en: string };
        standardColumn: string | null;
        versions: number[];
      }
    >();
    for (const r of rows) {
      const entry = byKey.get(r.fieldKey) ?? {
        fieldKey: r.fieldKey,
        type: r.type,
        label: { bn: r.labelBn, en: r.labelEn },
        standardColumn: r.standardColumn,
        versions: [],
      };
      // the latest version's type and label describe the field
      entry.type = r.type;
      entry.label = { bn: r.labelBn, en: r.labelEn };
      entry.standardColumn = r.standardColumn;
      entry.versions.push(r.formVersion.versionNo);
      byKey.set(r.fieldKey, entry);
    }
    return [...byKey.values()];
  }

  /** A draft version locked for a write, inside the caller's project scope and a project that still takes changes. */
  private async lockedDraft(tx: Tx, viewer: ProjectViewer, versionId: string) {
    await tx.$queryRaw`SELECT id FROM form_versions WHERE id = ${versionId}::uuid FOR UPDATE`;
    const row = await tx.formVersion.findUnique({
      where: { id: versionId },
      select: VERSION_SELECT,
    });
    if (!row) throw new ApiError('permission.not_found', 404);
    const project = await this.projects.locked(tx, viewer, row.form.projectId);
    if (!editableIn(statusOf(project.status), 'components'))
      throw new ApiError('project.read_only', 409);
    if (row.status !== 'draft') throw new ApiError('form.not_draft', 409);
    return row;
  }

  /** Whether the caller sees official-only sections of this project's forms. */
  async audienceOf(viewer: ProjectViewer, projectId: string): Promise<FormAudience> {
    if (viewer.principal.kind === 'volunteer') return 'volunteer';
    const official = await this.access.holdsOnProject(
      viewer.principal.userId,
      'application.view_official_section',
      projectId,
    );
    return official ? 'official' : 'volunteer';
  }

  /** A form whose project the caller reaches (404 otherwise, nothing named). */
  private async reachableForm(viewer: ProjectViewer, formId: string) {
    const form = await this.prisma.form.findUnique({
      where: { id: formId },
      select: { id: true, projectId: true },
    });
    if (!form) throw new ApiError('permission.not_found', 404);
    await this.projects.get(viewer, form.projectId);
    return form;
  }

  /** The first draft's definition, from the chosen source; refused when the source has none. */
  private async sourceDefinition(
    tx: Tx,
    viewer: ProjectViewer,
    body: FormCreate,
  ): Promise<FormDefinition> {
    const source = body.source;
    if (source.kind === 'blank')
      return parseDefinition(blankDefinition(await this.library.sources(tx)));
    if (source.kind === 'template') {
      const template = await this.library.template(tx, source.templateKey);
      if (!template) throw new ApiError('form.template_unknown', 404);
      const { form } = storedTemplateSchema.parse(template.definition);
      return parseDefinition(definitionFromTemplate(form, await this.library.sources(tx)));
    }
    const form = await tx.form.findUnique({
      where: { id: source.formId },
      select: {
        projectId: true,
        formVersionsForm: { where: { status: 'published' }, select: { id: true } },
      },
    });
    if (!form) throw new ApiError('permission.not_found', 404);
    await this.access.findProject(viewer.scope, form.projectId, { id: true }, tx);
    const published = form.formVersionsForm[0];
    if (!published) throw new ApiError('form.nothing_published', 409);
    return readDefinition(tx, published.id, 'official');
  }
}

/**
 * The definition of a version in the shared shape: every section for an official, the
 * volunteer-visible ones for everyone else.
 */
export async function readDefinition(
  db: Tx,
  versionId: string,
  audience: FormAudience = 'official',
): Promise<FormDefinition> {
  const sections = await db.formSection.findMany({
    where: {
      formVersionId: versionId,
      ...(audience === 'official' ? {} : { visibility: 'volunteer' }),
    },
    orderBy: { sortOrder: 'asc' },
    select: {
      key: true,
      titleBn: true,
      titleEn: true,
      visibility: true,
      condition: true,
      librarySection: { select: { key: true } },
      formFieldsFormSection: {
        orderBy: { sortOrder: 'asc' },
        select: {
          fieldKey: true,
          type: true,
          labelBn: true,
          labelEn: true,
          required: true,
          standardColumn: true,
          settings: true,
          logic: true,
          calculation: true,
          libraryField: { select: { key: true } },
          fieldOptionsFormField: {
            orderBy: { sortOrder: 'asc' },
            select: {
              code: true,
              labelBn: true,
              labelEn: true,
              allowsOtherText: true,
              dependsOnOption: { select: { code: true } },
            },
          },
        },
      },
    },
  });
  return {
    sections: sections.map((s): FormSectionDefinition => ({
      key: s.key,
      librarySectionKey: s.librarySection?.key ?? null,
      title: { bn: s.titleBn, en: s.titleEn },
      visibility: visibilityOf(s.visibility),
      condition: s.condition === null ? null : conditionSchema.parse(s.condition),
      fields: s.formFieldsFormSection.map((x): FormFieldDefinition => ({
        fieldKey: x.fieldKey,
        libraryFieldKey: x.libraryField?.key ?? null,
        type: fieldTypeOf(x.type),
        label: { bn: x.labelBn, en: x.labelEn },
        required: x.required,
        standardColumn: x.standardColumn,
        settings: fieldSettingsSchema.parse(x.settings ?? {}),
        ...(x.logic === null ? {} : { logic: fieldLogicSchema.parse(x.logic) }),
        ...(x.calculation === null ? {} : { calculation: calculationSchema.parse(x.calculation) }),
        options: x.fieldOptionsFormField.map((o): FieldOption => ({
          code: o.code,
          label: { bn: o.labelBn, en: o.labelEn },
          dependsOnOptionCode: o.dependsOnOption?.code ?? null,
          allowsOtherText: o.allowsOtherText,
        })),
      })),
    })),
  };
}

/** Writes a definition's sections, fields and options as the rows of a draft version. */
export async function writeDefinitionRows(
  tx: Tx,
  versionId: string,
  definition: FormDefinition,
  actor: string,
  keptFieldIds: Map<string, string> = new Map(),
): Promise<void> {
  const [sectionIds, fieldIds] = await Promise.all([
    libraryIds(tx, 'section'),
    libraryIds(tx, 'field'),
  ]);
  let sectionOrder = 0;
  for (const section of definition.sections) {
    sectionOrder += 1;
    const sectionId = uuidv7();
    await tx.formSection.create({
      data: {
        id: sectionId,
        formVersionId: versionId,
        librarySectionId: section.librarySectionKey
          ? (sectionIds.get(section.librarySectionKey) ?? null)
          : null,
        key: section.key,
        titleBn: section.title.bn,
        titleEn: section.title.en,
        sortOrder: sectionOrder,
        visibility: section.visibility,
        condition:
          section.condition === null || section.condition === undefined
            ? undefined
            : json(section.condition),
        createdBy: actor,
        updatedBy: actor,
      },
    });
    let fieldOrder = 0;
    for (const field of section.fields) {
      fieldOrder += 1;
      const fieldId = keptFieldIds.get(field.fieldKey) ?? uuidv7();
      await tx.formField.create({
        data: {
          id: fieldId,
          formSectionId: sectionId,
          formVersionId: versionId,
          libraryFieldId: field.libraryFieldKey
            ? (fieldIds.get(field.libraryFieldKey) ?? null)
            : null,
          fieldKey: field.fieldKey,
          type: field.type,
          labelBn: field.label.bn,
          labelEn: field.label.en,
          required: field.required,
          standardColumn: field.standardColumn,
          settings: json(field.settings ?? {}),
          logic: field.logic === undefined ? undefined : json(field.logic),
          calculation: field.calculation === undefined ? undefined : json(field.calculation),
          sortOrder: fieldOrder,
          createdBy: actor,
          updatedBy: actor,
        },
      });
      // options first, then the branching links by code, so a link never points at a later row
      const optionIds = new Map<string, string>();
      let optionOrder = 0;
      for (const option of field.options ?? []) {
        optionOrder += 1;
        const optionId = uuidv7();
        optionIds.set(option.code, optionId);
        await tx.fieldOption.create({
          data: {
            id: optionId,
            formFieldId: fieldId,
            code: option.code,
            labelBn: option.label.bn,
            labelEn: option.label.en,
            allowsOtherText: option.allowsOtherText ?? false,
            sortOrder: optionOrder,
            createdBy: actor,
            updatedBy: actor,
          },
        });
      }
      for (const option of field.options ?? []) {
        if (!option.dependsOnOptionCode) continue;
        const dependsOnOptionId = optionIds.get(option.dependsOnOptionCode);
        if (!dependsOnOptionId) continue;
        await tx.fieldOption.update({
          where: { id: optionIds.get(option.code)! },
          data: { dependsOnOptionId },
        });
      }
    }
  }
}

/** The application-form component of the project names its forms. */
export async function nameFormOnComponent(
  tx: Tx,
  projectId: string,
  formId: string,
  actor: string,
): Promise<void> {
  const row = await tx.projectComponent.findUnique({
    where: { projectId_componentKey: { projectId, componentKey: 'application_form' } },
    select: { settings: true },
  });
  const settings =
    row && typeof row.settings === 'object' && row.settings !== null && !Array.isArray(row.settings)
      ? (row.settings as Record<string, unknown>)
      : {};
  const ids = Array.isArray(settings.form_ids)
    ? settings.form_ids.filter((x): x is string => typeof x === 'string')
    : [];
  const next = { ...settings, form_ids: [...ids, formId] };
  if (row)
    await tx.projectComponent.update({
      where: { projectId_componentKey: { projectId, componentKey: 'application_form' } },
      data: { settings: next, updatedBy: actor },
    });
  else
    await tx.projectComponent.create({
      data: {
        id: uuidv7(),
        projectId,
        componentKey: 'application_form',
        enabled: true,
        settings: next,
        createdBy: actor,
        updatedBy: actor,
      },
    });
}

/** The library's section or field rows by key, for the library links of a new form. */
async function libraryIds(tx: Tx, kind: 'section' | 'field'): Promise<Map<string, string>> {
  const rows =
    kind === 'section'
      ? await tx.formLibrarySection.findMany({ select: { id: true, key: true } })
      : await tx.formLibraryField.findMany({ select: { id: true, key: true } });
  return new Map(rows.map((r) => [r.key, r.id]));
}

/** What a project copy or a template brings as its first form. */
export interface FormToCreate {
  key: string;
  title: { bn: string; en: string };
  definition: FormDefinition;
}

/**
 * A form of a project as draft 1 with this definition, named on the application-form component;
 * the caller holds the project row and has checked the definition.
 */
export async function createFormFromDefinition(
  tx: Tx,
  projectId: string,
  form: FormToCreate,
  actor: string,
): Promise<{ formId: string; versionId: string }> {
  const formId = uuidv7();
  const versionId = uuidv7();
  await tx.form.create({
    data: {
      id: formId,
      projectId,
      key: form.key,
      titleBn: form.title.bn,
      titleEn: form.title.en,
      createdBy: actor,
      updatedBy: actor,
    },
  });
  await tx.formVersion.create({
    data: { id: versionId, formId, versionNo: 1, createdBy: actor, updatedBy: actor },
  });
  await writeDefinitionRows(tx, versionId, form.definition, actor);
  await nameFormOnComponent(tx, projectId, formId, actor);
  return { formId, versionId };
}

function formView(row: FormRow): FormView {
  return {
    id: row.id,
    projectId: row.projectId,
    key: row.key,
    title: { bn: row.titleBn, en: row.titleEn },
    publishedVersionId: row.formVersionsForm.find((v) => v.status === 'published')?.id ?? null,
    draftVersionId: row.formVersionsForm.find((v) => v.status === 'draft')?.id ?? null,
  };
}

function versionView(
  row: { id: string; formId: string; versionNo: number; status: string; publishedAt: Date | null },
  definition: FormDefinition,
): FormVersionView {
  return {
    id: row.id,
    formId: row.formId,
    versionNo: row.versionNo,
    status: row.status,
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
    ...definition,
  };
}
