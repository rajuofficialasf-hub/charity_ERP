import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { AccessService } from '../access/service';
import type { ApplicationsService, ApplicationViewer } from '../applications/service';
import { type ApplicationSummary, applicationSummary } from '../applications/view';
import type { Principal } from '../auth/principal';
import type { Clock } from '../core/clock';
import { ApiError } from '../i18n/api-error';
import { versionView } from '../routes/forms';
import type { FormVersionView } from '../services/forms';
import type { LocationsService } from '../services/locations';
import type { MyProjectsService } from '../services/my-projects';

const uuid = z.uuid();
const bilingual = z.object({ bn: z.string(), en: z.string() });

/** A project as the volunteer's own list shows it (the `/me/projects` answer). */
const myProjectView = z.object({
  projectId: uuid,
  code: z.string(),
  year: z.number().int(),
  name: bilingual,
  status: z.string(),
  applyFrom: z.string().nullable(),
  applyTo: z.string().nullable(),
  perVolunteerLimit: z.number().int().nullable(),
  dawahEnabled: z.boolean(),
  via: z.enum(['assignment', 'team']),
  permissionSet: z.string().nullable(),
  isPaid: z.boolean(),
  consentStatus: z.enum(['pending', 'accepted']),
  rulesVersion: z.number().int(),
  applicationsCounted: z.number().int(),
  applicationsLeft: z.number().int().nullable(),
  leadsTeam: z.boolean(),
});

/** The data set a phone keeps, in one answer; the field mask runs on it like on every read. */
export const snapshotView = z.object({
  serverTime: z.string(),
  projects: z.array(myProjectView),
  formVersions: z.array(versionView),
  applications: z.array(applicationSummary),
  /** Every own application the server still lists: the phone drops what is missing here. */
  applicationIds: z.array(uuid),
  locationsVersion: z.string(),
});

type MyProjectItem = Awaited<ReturnType<MyProjectsService['list']>>[number];

export interface SnapshotView {
  serverTime: string;
  projects: MyProjectItem[];
  formVersions: FormVersionView[];
  applications: ApplicationSummary[];
  applicationIds: string[];
  locationsVersion: string;
}

/** The most changed applications one pull carries; an older backlog arrives with the next pulls. */
export const SNAPSHOT_MAX_APPLICATIONS = 500;

/**
 * The offline data set of a volunteer (docs/architecture/OFFLINE_SYNC.md "What is cached on the
 * device"): the projects they consented to, the published application form of each as their
 * audience sees it, their own applications changed since the last pull and the full id list.
 * Everything comes from the services that answer the online screens, with the same scope and
 * field classes, so nothing reaches the phone that the screens would not show. An official gets
 * empty sets: no official data is cached in this task.
 */
export class SnapshotService {
  constructor(
    private readonly access: AccessService,
    private readonly myProjects: MyProjectsService,
    private readonly applications: ApplicationsService,
    private readonly locations: LocationsService,
    private readonly clock: Clock,
  ) {}

  async read(
    principal: Principal,
    fieldClasses: ReadonlySet<string>,
    since?: Date,
  ): Promise<SnapshotView> {
    const serverTime = this.clock.now().toISOString();
    const locationsVersion = await this.locations.version();
    const empty: SnapshotView = {
      serverTime,
      projects: [],
      formVersions: [],
      applications: [],
      applicationIds: [],
      locationsVersion,
    };
    if (principal.kind !== 'volunteer') return empty;
    const projects = (await this.myProjects.list(principal)).filter(
      (p) => p.consentStatus === 'accepted',
    );
    const access = await this.access.load(principal.userId);
    const formViewer: ApplicationViewer = {
      principal,
      scope: await this.access.scopeFor(principal, access, 'application.create', 'project'),
      fieldClasses,
    };
    const formVersions: SnapshotView['formVersions'] = [];
    for (const p of projects) {
      try {
        formVersions.push(await this.applications.applicationForm(formViewer, p.projectId));
      } catch (error) {
        // a project without a published form, or one the volunteer may not apply on, has no form to keep
        if (
          error instanceof ApiError &&
          ['application.form_not_published', 'permission.not_found'].includes(error.code)
        )
          continue;
        throw error;
      }
    }
    const listViewer: ApplicationViewer = {
      principal,
      scope: await this.access.scopeFor(principal, access, 'application.view', 'application'),
      fieldClasses,
    };
    const own = await this.applications.listMineSince(listViewer, since, SNAPSHOT_MAX_APPLICATIONS);
    return {
      serverTime,
      projects,
      formVersions,
      applications: own.changed,
      applicationIds: own.ids,
      locationsVersion,
    };
  }
}

/** The version of a snapshot: the same data set answers the same tag, whatever the server time. */
export function snapshotEtag(view: SnapshotView): string {
  const { serverTime: _now, ...rest } = view;
  const hash = createHash('sha256').update(JSON.stringify(rest)).digest('base64url');
  return `"${hash.slice(0, 22)}"`;
}
