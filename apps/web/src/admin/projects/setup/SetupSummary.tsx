import type { ComponentKey } from '@css/shared';
import { type MissingItem, setupCheck, WORKFLOWS_WITHOUT_LIMIT } from '@css/shared/projects';
import { Card } from '@css/ui';
import { useTranslations } from 'use-intl';
import type { Area, FundSource, ProjectComponent } from './setup-api';
import { useSetup } from './setup-context';

/** The section each missing item is fixed in (the anchors of the index). */
const SECTION = new Map<MissingItem, string>([
  ['name', 'basics'],
  ['year', 'basics'],
  ['workflow', 'basics'],
  ['window', 'window'],
  ['limit', 'window'],
  ['cost', 'budget'],
  ['target', 'budget'],
  ['fund_sources', 'budget'],
  ['fund_sources_total', 'budget'],
  ['area', 'areas'],
  ['photo_rule', 'components'],
]);
const sectionOf = (item: MissingItem) =>
  item.startsWith('component:') ? 'components' : (SECTION.get(item) ?? 'basics');

/**
 * What the project still needs before it can be activated, from the same check the server runs
 * (the activation rule of DECISION_LOG D-095), each item linked to its section.
 */
export function SetupSummary({
  components,
  fundSources,
  areas,
}: {
  components: ProjectComponent[];
  fundSources: FundSource[];
  areas: Area[];
}) {
  const { project } = useSetup();
  const t = useTranslations('admin.projects.setup');
  const tk = useTranslations('admin.projects.component');
  const missing = setupCheck({
    name: project.name,
    year: project.year,
    workflowKey: project.workflowKey,
    applyFrom: project.applyFrom,
    applyTo: project.applyTo,
    perVolunteerLimit: project.perVolunteerLimit,
    limitRequired: !WORKFLOWS_WITHOUT_LIMIT.includes(project.workflowKey),
    costPerBeneficiary: project.costPerBeneficiary ?? null,
    targetBeneficiaries: project.targetBeneficiaries ?? null,
    fundSources,
    areaCount: areas.length,
    components: components.map((c) => ({ ...c, settings: c.settings ?? {} })),
  });
  const label = (item: MissingItem) =>
    item.startsWith('component:')
      ? t('missing.component', { name: tk(item.slice('component:'.length) as ComponentKey) })
      : t(`missing.${item as Exclude<MissingItem, `component:${string}`>}`);

  return (
    <aside className="admin-setup-summary" aria-label={t('summary')}>
      <Card title={t('summary')} headingLevel={2}>
        {project.status !== 'draft' ? (
          <p className="admin-muted">{t('summary_active')}</p>
        ) : missing.length === 0 ? (
          <p>{t('ready')}</p>
        ) : (
          <>
            <p>{t('missing_title', { count: String(missing.length) })}</p>
            <ul className="admin-setup-missing">
              {missing.map((item) => (
                <li key={item}>
                  <a href={`#${sectionOf(item)}`}>{label(item)}</a>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
    </aside>
  );
}
