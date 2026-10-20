import type { Me } from '@css/shared/auth';

/** A widget whose module exists by now, below "needs your attention". */
export type LiveWidget =
  | 'my_projects'
  | 'my_team'
  | 'official_projects'
  | 'project_states'
  | 'templates'
  | 'shortcuts'
  | 'notifications';

/** A widget whose module comes in a later phase: a quiet "coming later" card. */
export type LaterWidget =
  | 'my_applications'
  | 'today_distribution'
  | 'today_class'
  | 'today_work'
  | 'daee_tracking'
  | 'exam_schedule'
  | 'review_queue'
  | 'program_dashboard'
  | 'work_progress'
  | 'alerts'
  | 'safe_water'
  | 'media_work'
  | 'finance_overview'
  | 'procurement_issues';

export type Widget = LiveWidget | LaterWidget;

/** The order of the widgets on every home (docs/ui/SCREENS.md, "My Work home per role"). */
const ORDER: readonly Widget[] = [
  'my_projects',
  'my_team',
  'official_projects',
  'project_states',
  'templates',
  'shortcuts',
  'today_distribution',
  'today_class',
  'today_work',
  'my_applications',
  'review_queue',
  'daee_tracking',
  'exam_schedule',
  'program_dashboard',
  'work_progress',
  'alerts',
  'safe_water',
  'media_work',
  'finance_overview',
  'procurement_issues',
  'notifications',
];

const VOLUNTEER: readonly Widget[] = [
  'my_projects',
  'my_team',
  'my_applications',
  'today_distribution',
  'notifications',
];

/** The widgets of each role; a person with several roles sees the union. */
export const ROLE_WIDGETS: Readonly<Record<string, readonly Widget[]>> = {
  volunteer_general: VOLUNTEER,
  volunteer_both: [...VOLUNTEER, 'today_class'],
  volunteer_team_member: ['my_projects', 'my_applications', 'notifications'],
  volunteer_local_daee: ['my_projects', 'today_class', 'notifications'],
  volunteer_paid: ['my_projects', 'today_work', 'notifications'],
  official_daee: ['daee_tracking', 'exam_schedule', 'notifications'],
  project_executive: ['official_projects', 'review_queue', 'notifications'],
  regional_program_manager: ['official_projects', 'review_queue', 'notifications'],
  program_manager: ['project_states', 'templates', 'program_dashboard', 'notifications'],
  department_head: ['shortcuts', 'work_progress', 'alerts', 'notifications'],
  monitoring_team: ['shortcuts', 'work_progress', 'alerts', 'notifications'],
  implementer: ['safe_water', 'notifications'],
  media_team: ['media_work', 'notifications'],
  finance_team: ['finance_overview', 'notifications'],
  procurement_team: ['procurement_issues', 'notifications'],
};

/** The data of these widgets is closed to a registration still waiting for approval. */
const ACTIVE_ONLY: readonly Widget[] = ['my_projects', 'my_team', 'notifications'];

/** The widgets of a person's home in the fixed order, without repeats. */
export function widgetsFor(me: Pick<Me, 'roles' | 'state'>): Widget[] {
  // eslint-disable-next-line security/detect-object-injection -- a role key into a constant table
  const mine = new Set(me.roles.flatMap((role) => ROLE_WIDGETS[role] ?? []));
  return ORDER.filter((w) => mine.has(w) && (me.state === 'active' || !ACTIVE_ONLY.includes(w)));
}

const LIVE: readonly Widget[] = [
  'my_projects',
  'my_team',
  'official_projects',
  'project_states',
  'templates',
  'shortcuts',
  'notifications',
];

export const isLater = (w: Widget): w is LaterWidget => !LIVE.includes(w);
