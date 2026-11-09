import { randomBytes } from 'node:crypto';
import { uuidv7 } from '@css/shared';
import type { PublicLinkConfig } from '@css/shared/forms';
import { editableIn, projectStatusOf } from '@css/shared/projects';
import type { AuditWriter } from '../audit/audit-writer';
import type { Env } from '../config/env';
import type { PrismaService, Tx } from '../core/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import { ApiError } from '../i18n/api-error';
import { readDefinition } from './forms';
import type { ProjectViewer, ProjectsService } from './projects';
import { asksForFiles } from './public-link-rules';

export interface PublicLinkView {
  enabled: boolean;
  formId: string | null;
  url: string | null;
}

/**
 * The public application link of a project (docs/plans/2026-10-21-1135-feat-form-engine-plan.md, "The public
 * link"): a PM switches it on with the one form it opens and gets the URL; every enable issues a fresh token,
 * so a leaked link is retired by a toggle. The token is a capability: it is handed out through
 * the URL and never written into an audit row.
 */
export class PublicLinkService {
  constructor(
    private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly audit: AuditWriter,
    private readonly projects: ProjectsService,
  ) {}

  async configure(
    viewer: ProjectViewer,
    projectId: string,
    body: PublicLinkConfig,
  ): Promise<PublicLinkView> {
    const actor = viewer.principal.userId;
    return this.prisma.$transaction(async (tx) => {
      const project = await this.projects.locked(tx, viewer, projectId);
      if (!editableIn(projectStatusOf(project.status), 'components'))
        throw new ApiError('project.read_only', 409);
      let settings: Prisma.InputJsonValue = { enabled: false };
      let token: string | null = null;
      let formKey: string | null = null;
      if (body.enabled) {
        if (!body.formId)
          throw new ApiError('validation.failed', 422, undefined, [
            { path: 'formId', code: 'validation.required' },
          ]);
        formKey = await this.linkableForm(tx, projectId, body.formId);
        token = randomBytes(32).toString('base64url');
        settings = { enabled: true, token, form_ids: [body.formId] };
      }
      const where = { projectId_componentKey: { projectId, componentKey: 'public_link' } };
      const existing = await tx.projectComponent.findUnique({ where, select: { id: true } });
      if (existing)
        await tx.projectComponent.update({
          where,
          data: { enabled: body.enabled, settings, updatedBy: actor },
        });
      else
        await tx.projectComponent.create({
          data: {
            id: uuidv7(),
            projectId,
            componentKey: 'public_link',
            enabled: body.enabled,
            settings,
            createdBy: actor,
            updatedBy: actor,
          },
        });
      await this.audit.record(tx, {
        action: 'form.public_link_change',
        entityType: 'project',
        entityId: projectId,
        new: { enabled: body.enabled, formKey },
      });
      return {
        enabled: body.enabled,
        formId: body.enabled ? (body.formId ?? null) : null,
        url: token ? this.urlOf(token) : null,
      };
    });
  }

  /** The URL an applicant opens; the web route of the public form arrives with its screen. */
  urlOf(token: string): string {
    return `${this.env.APP_ORIGIN}/apply/${token}`;
  }

  /**
   * A form the link may open: a beneficiary application form of this project, with a published
   * version whose volunteer-visible part asks for no file or signature, so every public entry
   * carries the identity the checks need. Answers the form's key.
   */
  private async linkableForm(tx: Tx, projectId: string, formId: string): Promise<string> {
    const form = await tx.form.findUnique({
      where: { id: formId },
      select: {
        projectId: true,
        key: true,
        kind: true,
        formVersionsForm: { where: { status: 'published' }, select: { id: true } },
      },
    });
    if (!form || form.projectId !== projectId) throw new ApiError('form.not_of_project', 422);
    if (form.kind !== 'beneficiary_application')
      throw new ApiError('public.form_not_application', 422);
    const published = form.formVersionsForm[0];
    if (!published) throw new ApiError('public.form_unpublished', 422);
    if (asksForFiles(await readDefinition(tx, published.id, 'volunteer')))
      throw new ApiError('public.form_has_files', 422);
    return form.key;
  }
}
