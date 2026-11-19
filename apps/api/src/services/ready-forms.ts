import { uuidv7 } from '@css/shared';
import {
  blankDefinition,
  type FormDefinition,
  identityRoleOf,
  type FormKind,
  type FormPlace,
  type ReadyFormCreate,
} from '@css/shared/forms';
import { editableIn, projectStatusOf } from '@css/shared/projects';
import type { AuditWriter } from '../audit/audit-writer.js';
import type { PrismaService, Tx } from '../core/prisma.service.js';
import { ApiError } from '../i18n/api-error.js';
import {
  createUnlessKeyTaken,
  FORM_SELECT,
  formKindOf,
  type FormsService,
  type FormVersionView,
  type FormView,
  formView,
  nameFormOnComponent,
  readDefinition,
  versionView,
  writeDefinitionRows,
} from './forms.js';
import type { ProjectViewer, ProjectsService } from './projects.js';

/** A ready form as the catalogue lists it. */
export interface ReadyFormView {
  id: string;
  key: string;
  kind: FormKind;
  title: { bn: string; en: string };
  publishedVersionId: string | null;
  publishedVersionNo: number | null;
  /** The open draft; shown to the builders only. */
  draftVersionId: string | null;
}

/** A ready form outside the projects: never a project's form, never the library. */
const READY = { projectId: null, kind: { not: 'library' } } as const;

/**
 * The ready forms the Monitoring Team and the Department Head build outside the projects, and
 * their placement on a project by its PM (docs/DECISION_LOG.md, the decisions on who builds forms
 * and on the ready-forms catalogue): a placed form is a published copy that names its source and
 * the version it holds, and it changes only when the PM takes the ready form's newer version, as
 * the project form's next version. Applications keep the version they were made on.
 */
export class ReadyFormsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditWriter,
    private readonly projects: ProjectsService,
    private readonly forms: FormsService,
  ) {}

  /** The builders see every ready form; a PM the published ones, without their drafts. */
  async list(viewer: ProjectViewer): Promise<ReadyFormView[]> {
    const builder = await this.forms.buildsOutside(viewer, 'other');
    const rows = await this.prisma.form.findMany({
      where: {
        ...READY,
        ...(builder ? {} : { formVersionsForm: { some: { status: 'published' } } }),
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        key: true,
        kind: true,
        titleBn: true,
        titleEn: true,
        formVersionsForm: {
          where: { status: { in: ['published', 'draft'] } },
          select: { id: true, status: true, versionNo: true },
        },
      },
    });
    return rows.map((r) => {
      const published = r.formVersionsForm.find((v) => v.status === 'published');
      const draft = builder ? r.formVersionsForm.find((v) => v.status === 'draft') : undefined;
      return {
        id: r.id,
        key: r.key,
        kind: formKindOf(r.kind),
        title: { bn: r.titleBn, en: r.titleEn },
        publishedVersionId: published?.id ?? null,
        publishedVersionNo: published?.versionNo ?? null,
        draftVersionId: draft?.id ?? null,
      };
    });
  }

  /** A new ready form as draft 1: one empty section, or a copy of another ready form. */
  async create(viewer: ProjectViewer, body: ReadyFormCreate): Promise<ReadyFormView> {
    const actor = viewer.principal.userId;
    return this.prisma.$transaction(async (tx) => {
      const taken = await tx.form.findFirst({
        where: { projectId: null, key: body.key },
        select: { id: true },
      });
      if (taken) throw new ApiError('form.key_taken', 409);
      const copied =
        body.source.kind === 'blank'
          ? blankDefinition()
          : await readDefinition(
              tx,
              (await this.publishedOf(tx, body.source.formId, 'form.nothing_published', 409)).id,
              'official',
            );
      // a form of the kind other takes no identity marks, so a copy into it drops them
      const definition = body.kind === 'other' ? withoutIdentityMarks(copied) : copied;
      const formId = uuidv7();
      const versionId = uuidv7();
      await createUnlessKeyTaken(() =>
        tx.form.create({
          data: {
            id: formId,
            projectId: null,
            key: body.key,
            titleBn: body.title.bn,
            titleEn: body.title.en,
            kind: body.kind,
            createdBy: actor,
            updatedBy: actor,
          },
        }),
      );
      await tx.formVersion.create({
        data: { id: versionId, formId, versionNo: 1, createdBy: actor, updatedBy: actor },
      });
      await writeDefinitionRows(tx, versionId, definition, actor);
      await this.audit.record(tx, {
        action: 'form.ready_create',
        entityType: 'form',
        entityId: formId,
        new: { key: body.key, kind: body.kind, source: body.source.kind, versionId },
      });
      return {
        id: formId,
        key: body.key,
        kind: body.kind,
        title: body.title,
        publishedVersionId: null,
        publishedVersionNo: null,
        draftVersionId: versionId,
      };
    });
  }

  /**
   * The published version of a ready form, as a PM reads it before placing it; the official-only
   * sections only for a caller who sees them somewhere.
   */
  async published(viewer: ProjectViewer, formId: string): Promise<FormVersionView> {
    const version = await this.publishedOf(this.prisma, formId, 'permission.not_found', 404);
    const audience = await this.forms.audienceAnywhere(viewer);
    return versionView(
      { ...version, formId, status: 'published' },
      await readDefinition(this.prisma, version.id, audience),
    );
  }

  /**
   * Places a ready form's published version on a project: a new project form, published at once,
   * naming the ready form and the version it copied.
   */
  async place(viewer: ProjectViewer, projectId: string, body: FormPlace): Promise<FormView> {
    const actor = viewer.principal.userId;
    return this.prisma.$transaction(async (tx) => {
      const project = await this.projects.locked(tx, viewer, projectId);
      if (!editableIn(projectStatusOf(project.status), 'components'))
        throw new ApiError('project.read_only', 409);
      // the application form is changed only before anyone could apply with the old one
      if (body.replace && project.status !== 'draft')
        throw new ApiError('form.replace_draft_only', 409);
      const source = await tx.form.findFirst({
        where: { id: body.readyFormId, ...READY },
        select: { key: true, kind: true, titleBn: true, titleEn: true },
      });
      if (!source) throw new ApiError('permission.not_found', 404);
      const published = await this.publishedOf(tx, body.readyFormId, 'form.nothing_published', 422);
      const key = body.key ?? (await freeKey(tx, projectId, source.key));
      const taken = await tx.form.findFirst({ where: { projectId, key }, select: { id: true } });
      if (taken) throw new ApiError('form.key_taken', 409);
      const formId = uuidv7();
      await createUnlessKeyTaken(() =>
        tx.form.create({
          data: {
            id: formId,
            projectId,
            key,
            titleBn: source.titleBn,
            titleEn: source.titleEn,
            kind: source.kind,
            sourceFormId: body.readyFormId,
            sourceVersionNo: published.versionNo,
            createdBy: actor,
            updatedBy: actor,
          },
        }),
      );
      const versionId = await this.copyPublished(tx, formId, 1, published.id, actor);
      const replacedFormIds = body.replace
        ? await retireApplicationForms(tx, projectId, formId, actor)
        : [];
      await nameFormOnComponent(tx, projectId, formId, actor);
      await this.audit.record(tx, {
        action: 'form.place',
        entityType: 'form',
        entityId: formId,
        new: {
          projectId,
          key,
          readyFormId: body.readyFormId,
          versionNo: published.versionNo,
          versionId,
          ...(replacedFormIds.length ? { replacedFormIds } : {}),
        },
      });
      return formView(
        await tx.form.findUniqueOrThrow({ where: { id: formId }, select: FORM_SELECT }),
      );
    });
  }

  /**
   * Takes the ready form's newer published version as the placed form's next version; the one
   * before is retired, and the applications made on it keep it.
   */
  async take(viewer: ProjectViewer, formId: string): Promise<FormView> {
    const actor = viewer.principal.userId;
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM forms WHERE id = ${formId}::uuid FOR UPDATE`;
      const form = await tx.form.findUnique({
        where: { id: formId },
        select: {
          projectId: true,
          sourceFormId: true,
          sourceVersionNo: true,
          formVersionsForm: { select: { versionNo: true } },
        },
      });
      if (!form?.projectId || !form.sourceFormId || form.sourceVersionNo === null)
        throw new ApiError('permission.not_found', 404);
      const project = await this.projects.locked(tx, viewer, form.projectId);
      if (!editableIn(projectStatusOf(project.status), 'components'))
        throw new ApiError('project.read_only', 409);
      const newer = await tx.formVersion.findFirst({
        where: { formId: form.sourceFormId, status: 'published' },
        select: { id: true, versionNo: true },
      });
      if (!newer || newer.versionNo <= form.sourceVersionNo)
        throw new ApiError('form.no_newer_version', 409);
      const versionNo = Math.max(...form.formVersionsForm.map((v) => v.versionNo)) + 1;
      const versionId = await this.copyPublished(tx, formId, versionNo, newer.id, actor);
      // the public link may open this form: its next version must still be one the link can open
      await this.forms.assertLinkable(tx, form.projectId, formId, versionId);
      await tx.form.update({
        where: { id: formId },
        data: { sourceVersionNo: newer.versionNo, updatedBy: actor },
      });
      await this.audit.record(tx, {
        action: 'form.take_version',
        entityType: 'form',
        entityId: formId,
        new: {
          readyFormId: form.sourceFormId,
          fromVersionNo: form.sourceVersionNo,
          toVersionNo: newer.versionNo,
          versionId,
        },
      });
      return formView(
        await tx.form.findUniqueOrThrow({ where: { id: formId }, select: FORM_SELECT }),
      );
    });
  }

  /** The published version of a ready form (the library and project forms are not ready forms). */
  private async publishedOf(
    db: Tx,
    formId: string,
    missing: 'form.nothing_published' | 'permission.not_found',
    status: number,
  ): Promise<{ id: string; versionNo: number; publishedAt: Date | null }> {
    const form = await db.form.findFirst({
      where: { id: formId, ...READY },
      select: {
        formVersionsForm: {
          where: { status: 'published' },
          select: { id: true, versionNo: true, publishedAt: true },
        },
      },
    });
    if (!form) throw new ApiError('permission.not_found', 404);
    const published = form.formVersionsForm[0];
    if (!published) throw new ApiError(missing, status);
    return published;
  }

  /**
   * A copy of a published version as this form's version `versionNo`, published at once: written
   * as a draft, then stamped, with the published version before it retired.
   */
  private async copyPublished(
    tx: Tx,
    formId: string,
    versionNo: number,
    sourceVersionId: string,
    actor: string,
  ): Promise<string> {
    const definition: FormDefinition = await readDefinition(tx, sourceVersionId, 'official');
    const versionId = uuidv7();
    await tx.formVersion.create({
      data: { id: versionId, formId, versionNo, createdBy: actor, updatedBy: actor },
    });
    await writeDefinitionRows(tx, versionId, definition, actor);
    await tx.formVersion.updateMany({
      where: { formId, status: 'published' },
      data: { status: 'retired', updatedBy: actor },
    });
    await tx.formVersion.update({
      where: { id: versionId },
      data: { status: 'published', publishedAt: new Date(), publishedBy: actor, updatedBy: actor },
    });
    return versionId;
  }
}

/**
 * The key a placement takes when the PM gives none: the ready form's key, or the first of
 * `<key>_2`, `<key>_3` … the project does not use yet, so one ready form can be placed twice.
 */
async function freeKey(tx: Tx, projectId: string, key: string): Promise<string> {
  const used = new Set(
    (
      await tx.form.findMany({
        where: { projectId, key: { startsWith: key } },
        select: { key: true },
      })
    ).map((f) => f.key),
  );
  if (!used.has(key)) return key;
  for (let n = 2; ; n += 1) {
    const next = `${key.slice(0, 40 - String(n).length - 1)}_${n}`;
    if (!used.has(next)) return next;
  }
}

/** The definition with every identity mark dropped (the questions stay, unmarked). */
function withoutIdentityMarks(definition: FormDefinition): FormDefinition {
  return {
    sections: definition.sections.map((s) => ({
      ...s,
      fields: s.fields.map((f) => (identityRoleOf(f) ? { ...f, standardColumn: null } : f)),
    })),
  };
}

/**
 * Leaves `keep` the project's one application form: the published version of every other form of
 * the kind is retired (one way, never deleted), the application form component forgets them and a
 * public link that opened one of them opens `keep`. Returns the forms retired.
 */
async function retireApplicationForms(
  tx: Tx,
  projectId: string,
  keep: string,
  actor: string,
): Promise<string[]> {
  const others = await tx.form.findMany({
    where: {
      projectId,
      kind: 'beneficiary_application',
      id: { not: keep },
      formVersionsForm: { some: { status: 'published' } },
    },
    select: { id: true },
  });
  const ids = others.map((f) => f.id);
  if (!ids.length) return ids;
  await tx.formVersion.updateMany({
    where: { formId: { in: ids }, status: 'published' },
    data: { status: 'retired', updatedBy: actor },
  });
  const components = await tx.projectComponent.findMany({
    where: { projectId, componentKey: { in: ['application_form', 'public_link'] } },
    select: { componentKey: true, settings: true },
  });
  for (const c of components) {
    const settings =
      c.settings && typeof c.settings === 'object' && !Array.isArray(c.settings)
        ? (c.settings as Record<string, unknown>)
        : {};
    if (!Array.isArray(settings.form_ids)) continue;
    const listed = settings.form_ids.filter((x): x is string => typeof x === 'string');
    const kept = listed.filter((id) => !ids.includes(id));
    // the public link moves to the new form; the component of the form names it on the place
    const next =
      c.componentKey === 'public_link' && kept.length < listed.length ? [keep, ...kept] : kept;
    await tx.projectComponent.update({
      where: { projectId_componentKey: { projectId, componentKey: c.componentKey } },
      data: { settings: { ...settings, form_ids: next }, updatedBy: actor },
    });
  }
  return ids;
}
