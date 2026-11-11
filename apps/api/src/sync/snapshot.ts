import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { AccessService } from '../access/service.js';
import type { ApplicationsService, ApplicationViewer } from '../applications/service.js';
import { type ApplicationSummary, applicationSummary } from '../applications/view.js';
import type { Principal } from '../auth/principal.js';
import type { PrismaService } from '../core/prisma.service.js';
import { ApiError } from '../i18n/api-error.js';
import { versionView } from '../routes/forms.js';
import type { FormVersionView } from '../services/forms.js';
import type { LocationsService } from '../services/locations.js';
import type { MyProjectsService } from '../services/my-projects.js';

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
  nextSince: z.string(),
  nextAfterId: uuid.nullable(),
  hasMore: z.boolean(),
  projects: z.array(myProjectView),
  formVersions: z.array(versionView.extend({ projectId: uuid })),
  applications: z.array(applicationSummary),
  /** Every own application the server still lists: the phone drops what is missing here. */
  applicationIds: z.array(uuid),
  locationsVersion: z.string(),
});

type MyProjectItem = Awaited<ReturnType<MyProjectsService['list']>>[number];
type SnapshotForm = FormVersionView & { projectId: string };

export interface SnapshotView {
  /** The database's clock when the answer was built. */
  serverTime: string;
  /** What the phone asks `since` next: the same window while more wait, else a little before now. */
  nextSince: string;
  /** While more wait, the last row of this page: the next ask carries it as `afterId`. */
  nextAfterId: string | null;
  /** More changed applications wait beyond this page: the phone asks again with `nextSince` and `nextAfterId`. */
  hasMore: boolean;
  projects: MyProjectItem[];
  /** The published application form of each project, each with the project it belongs to. */
  formVersions: SnapshotForm[];
  applications: ApplicationSummary[];
  applicationIds: string[];
  locationsVersion: string;
}

/** The changed applications one pull carries; the phone pages for the rest with `nextSince`. */
export const SNAPSHOT_MAX_APPLICATIONS = 500;

/**
 * A write that started before the pull may commit after it with an earlier stamp; the next pull
 * starts this far back, and the summaries' tags make a repeated row harmless.
 */
export const SNAPSHOT_OVERLAP_MS = 60_000;

/** The window of a first pull, which has no `since`: everything. */
const WINDOW_START = '1970-01-01T00:00:00.000Z';

/**
 * The offline data set of a volunteer (docs/architecture/OFFLINE_SYNC.md "What is cached on the
 * device"): the projects they consented to, the published application form of each as their
 * audience sees it, their own applications changed since the last pull and the full id list.
 * Everything comes from the services that answer the online screens, with the same scope and
 * field classes, so nothing reaches the phone that the screens would not show. An official or a
 * blocked volunteer gets empty sets: no official data is cached in this task, and a blocked
 * volunteer loses the sight of their applications.
 */
export class SnapshotService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly myProjects: MyProjectsService,
    private readonly applications: ApplicationsService,
    private readonly locations: LocationsService,
  ) {}

  async read(
    principal: Principal,
    fieldClasses: ReadonlySet<string>,
    window: { since?: Date; afterId?: string } = {},
    limit = SNAPSHOT_MAX_APPLICATIONS,
  ): Promise<SnapshotView> {
    // the rows are stamped by the database clock, so the phone's next `since` comes from it too
    const [clock] = await this.prisma.$queryRaw<{ now: Date }[]>`SELECT now() AS now`;
    const now = clock?.now ?? new Date();
    const serverTime = now.toISOString();
    const locationsVersion = await this.locations.version();
    const restSince = new Date(now.getTime() - SNAPSHOT_OVERLAP_MS).toISOString();
    const empty: SnapshotView = {
      serverTime,
      nextSince: restSince,
      nextAfterId: null,
      hasMore: false,
      projects: [],
      formVersions: [],
      applications: [],
      applicationIds: [],
      locationsVersion,
    };
    if (principal.kind !== 'volunteer' || (await this.applications.isBlocked(principal)))
      return empty;
    const [projects, access] = await Promise.all([
      this.myProjects
        .list(principal)
        .then((all) => all.filter((p) => p.consentStatus === 'accepted')),
      this.access.load(principal.userId),
    ]);
    const [formScope, listScope] = await Promise.all([
      this.access.scopeFor(principal, access, 'application.create', 'project'),
      this.access.scopeFor(principal, access, 'application.view', 'application'),
    ]);
    const formViewer: ApplicationViewer = { principal, scope: formScope, fieldClasses };
    const forms = await Promise.all(
      projects.map((p) =>
        this.applications
          .applicationForm(formViewer, p.projectId)
          .then((form): SnapshotForm => ({ ...form, projectId: p.projectId }))
          .catch((error: unknown) => {
            // a project without a published form, or one the volunteer may not apply on, has no form to keep
            if (
              error instanceof ApiError &&
              ['application.form_not_published', 'permission.not_found'].includes(error.code)
            )
              return null;
            throw error;
          }),
      ),
    );
    const listViewer: ApplicationViewer = { principal, scope: listScope, fieldClasses };
    const own = await this.applications.listMineSince(listViewer, window, limit);
    const last = own.changed.at(-1);
    // while more wait the window stays and the cursor moves; afterwards the next window begins
    const more = own.hasMore && last !== undefined;
    return {
      serverTime,
      nextSince: more ? (window.since?.toISOString() ?? WINDOW_START) : restSince,
      nextAfterId: more ? last.id : null,
      hasMore: more,
      projects,
      formVersions: forms.filter((f): f is SnapshotForm => f !== null),
      applications: own.changed,
      applicationIds: own.ids,
      locationsVersion,
    };
  }
}

/**
 * The version of a snapshot as the caller receives it: the same visible data set answers the
 * same tag, whatever the server time or the cursor.
 */
export function snapshotEtag(masked: unknown): string {
  const {
    serverTime: _now,
    nextSince: _next,
    nextAfterId: _after,
    ...rest
  } = masked as Record<string, unknown>;
  const hash = createHash('sha256').update(JSON.stringify(rest)).digest('base64url');
  return `"${hash.slice(0, 22)}"`;
}
