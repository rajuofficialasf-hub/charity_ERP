import { uuidv7 } from '@css/shared';
import {
  acceptsEveryPart,
  applicationsLeft,
  type Consent,
  requiredRuleParts,
} from '@css/shared/projects';
import type { AuditWriter } from '../audit/audit-writer';
import type { Principal } from '../auth/principal';
import type { Clock } from '../core/clock';
import type { PrismaService, Tx } from '../core/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import { ApiError } from '../i18n/api-error';
import { storedRules } from './project-rules';

/** A volunteer sees the projects that are running: never a draft, a closed or a cancelled one. */
const SHOWN = ['active', 'closing'];

const PROJECT = {
  id: true,
  code: true,
  year: true,
  nameBn: true,
  nameEn: true,
  status: true,
  applyFrom: true,
  applyTo: true,
  perVolunteerLimit: true,
  dawahEnabled: true,
  rulesVersion: true,
} satisfies Prisma.ProjectSelect;
type ProjectRow = Prisma.ProjectGetPayload<{ select: typeof PROJECT }>;

/** How the volunteer is on the project: their own assignment, or a membership of a team. */
type Link =
  | {
      via: 'assignment';
      id: string;
      consentStatus: string;
      permissionSet: string;
      isPaid: boolean;
      applicationsCounted: number;
    }
  // a team member's applications count against the main volunteer's limit
  | { via: 'team'; id: string; consentStatus: string; applicationsCounted: number };

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

function item(p: ProjectRow, link: Link) {
  return {
    projectId: p.id,
    code: p.code,
    year: p.year,
    name: { bn: p.nameBn, en: p.nameEn },
    status: p.status,
    applyFrom: day(p.applyFrom),
    applyTo: day(p.applyTo),
    perVolunteerLimit: p.perVolunteerLimit,
    dawahEnabled: p.dawahEnabled,
    via: link.via,
    permissionSet: link.via === 'assignment' ? link.permissionSet : null,
    isPaid: link.via === 'assignment' ? link.isPaid : false,
    consentStatus: link.consentStatus === 'accepted' ? ('accepted' as const) : ('pending' as const),
    rulesVersion: p.rulesVersion,
    applicationsCounted: link.applicationsCounted,
    applicationsLeft: applicationsLeft(p.perVolunteerLimit, link.applicationsCounted),
  };
}

/**
 * A volunteer's own projects and their consent to the rules (BR-039, BR-040; DECISION_LOG D-096).
 * The list shows running projects with the consent state; a project opens for work only after its
 * current rules are accepted (the access layer reads the same state). A team member is on the
 * project through a membership while the main volunteer's assignment lasts, and consents on their
 * own. Everything is read for the caller only: the volunteer, the project and the version never
 * come from someone else.
 */
export class MyProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditWriter,
    private readonly clock: Clock,
  ) {}

  private async volunteerOf(db: Tx, principal: Principal): Promise<string | null> {
    const v = await db.volunteer.findUnique({
      where: { userId: principal.userId },
      select: { id: true },
    });
    return v?.id ?? null;
  }

  /** The caller's links on running projects, or on one project. */
  private async links(db: Tx, volunteerId: string, projectId?: string) {
    const project = { status: { in: SHOWN }, ...(projectId ? { id: projectId } : {}) };
    const [assignments, memberships] = await Promise.all([
      db.projectVolunteer.findMany({
        where: { volunteerId, endedAt: null, project },
        select: {
          id: true,
          consentStatus: true,
          permissionSet: true,
          isPaid: true,
          applicationsCounted: true,
          project: { select: PROJECT },
        },
      }),
      db.volunteerTeam.findMany({
        where: { memberVolunteerId: volunteerId, removedAt: null, project },
        select: {
          id: true,
          projectId: true,
          leadVolunteerId: true,
          consentStatus: true,
          project: { select: PROJECT },
        },
      }),
    ]);
    // a membership counts while the main volunteer's assignment on that project lasts
    const leads = memberships.length
      ? await db.projectVolunteer.findMany({
          where: {
            endedAt: null,
            OR: memberships.map((m) => ({
              projectId: m.projectId,
              volunteerId: m.leadVolunteerId,
            })),
          },
          select: { projectId: true, volunteerId: true, applicationsCounted: true },
        })
      : [];
    const rows: { project: ProjectRow; link: Link }[] = assignments.map((a) => ({
      project: a.project,
      link: {
        via: 'assignment',
        id: a.id,
        consentStatus: a.consentStatus,
        permissionSet: a.permissionSet,
        isPaid: a.isPaid,
        applicationsCounted: a.applicationsCounted,
      },
    }));
    for (const m of memberships) {
      const lead = leads.find(
        (l) => l.projectId === m.projectId && l.volunteerId === m.leadVolunteerId,
      );
      if (lead)
        rows.push({
          project: m.project,
          link: {
            via: 'team',
            id: m.id,
            consentStatus: m.consentStatus,
            applicationsCounted: lead.applicationsCounted,
          },
        });
    }
    return rows.sort((a, b) => a.project.code.localeCompare(b.project.code));
  }

  async list(principal: Principal) {
    const volunteerId = await this.volunteerOf(this.prisma, principal);
    if (!volunteerId) return [];
    return (await this.links(this.prisma, volunteerId)).map((r) => item(r.project, r.link));
  }

  /** One of the caller's projects with the rules parts to read (404 when not theirs). */
  async get(principal: Principal, projectId: string) {
    const volunteerId = await this.volunteerOf(this.prisma, principal);
    const [row] = volunteerId ? await this.links(this.prisma, volunteerId, projectId) : [];
    if (!row) throw new ApiError('permission.not_found', 404);
    const stored = await this.prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { rules: true },
    });
    const rules = storedRules(stored.rules);
    return {
      ...item(row.project, row.link),
      rules: {
        version: row.project.rulesVersion,
        parts: requiredRuleParts(row.project.dawahEnabled).map((part) => ({
          part,
          // eslint-disable-next-line security/detect-object-injection -- part comes from RULES_PARTS
          text: rules[part] ?? { bn: '', en: '' },
        })),
      },
    };
  }

  /**
   * Accepts or refuses the current rules. The project row is locked, so a rules change at the same
   * moment either comes first (the version no longer matches: 409) or waits; an acceptance names
   * every part the volunteer had to read. A refusal leaves the link pending.
   */
  async consent(principal: Principal, projectId: string, body: Consent) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM projects WHERE id = ${projectId}::uuid FOR UPDATE`;
      const volunteerId = await this.volunteerOf(tx, principal);
      const [row] = volunteerId ? await this.links(tx, volunteerId, projectId) : [];
      if (!row || !volunteerId) throw new ApiError('permission.not_found', 404);
      const { project, link } = row;
      if (body.rulesVersion !== project.rulesVersion)
        throw new ApiError('project.rules_changed', 409);
      const accepted = body.decision === 'accepted';
      if (accepted && !acceptsEveryPart(body.parts, project.dawahEnabled))
        throw new ApiError('validation.failed', 422, undefined, [
          { path: 'parts', code: 'validation.required' },
        ]);
      await tx.projectConsent.create({
        data: {
          id: uuidv7(),
          projectId,
          volunteerId,
          ...(link.via === 'assignment'
            ? { projectVolunteerId: link.id }
            : { volunteerTeamId: link.id }),
          rulesVersion: project.rulesVersion,
          decision: body.decision,
          parts: body.parts,
          createdBy: principal.userId,
        },
      });
      const data = {
        consentStatus: accepted ? 'accepted' : 'pending',
        consentAt: accepted ? this.clock.now() : null,
        updatedBy: principal.userId,
      };
      if (link.via === 'assignment')
        await tx.projectVolunteer.update({ where: { id: link.id }, data });
      else await tx.volunteerTeam.update({ where: { id: link.id }, data });
      await this.audit.record(tx, {
        action: 'volunteer.consent',
        entityType: 'project',
        entityId: projectId,
        old: { via: link.via, consentStatus: link.consentStatus },
        new: {
          via: link.via,
          consentStatus: data.consentStatus,
          decision: body.decision,
          rulesVersion: project.rulesVersion,
          parts: body.parts,
        },
      });
      return item(project, { ...link, consentStatus: data.consentStatus });
    });
  }
}
