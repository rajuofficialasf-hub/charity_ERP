import type { ProjectsWork as Work, ProjectWork } from '@css/shared/auth';
import { formatCount, formatDate, formatDecimal } from '@css/shared/format';
import { type Locale, localized } from '@css/shared/i18n';
import { Card, EmptyState, LinkButton, Skeleton, Text } from '@/ui';
import type { UseQueryResult } from '@tanstack/react-query';
import { useId } from 'react';
import { Link } from 'react-router';
import { useLocale, useTranslations } from 'use-intl';
import { ProjectStatusBadge } from '../../admin/projects/ProjectStatusBadge';
import { LoadError } from '../../components/LoadError';

const AREA = ['received', 'waiting', 'approved', 'rejected', 'waitlisted', 'volunteers'] as const;
const MINE = ['reviewed', 'approved', 'rejected', 'waitlisted'] as const;

/**
 * An official's projects by year, newest first, each with their role and areas there and the
 * figures of their work (docs/DECISION_LOG.md, the official's own profile of 2026-11-02): the
 * applications in their area and the decisions they made. A person every project is open to gets
 * one line and the project list. Shown on the own profile and on the admin's official profile.
 */
export function ProjectsWork({
  query,
  own,
  projectLinks,
}: {
  query: UseQueryResult<Work>;
  /** The person's own figures ("your decisions"), or another official's ("their decisions"). */
  own: boolean;
  /** The viewer may open a project's page. */
  projectLinks: boolean;
}) {
  const t = useTranslations('registration.profile.work');
  if (query.isPending) return <Skeleton count={3} />;
  if (query.error || !query.data)
    return <LoadError error={query.error} onRetry={() => void query.refetch()} />;
  const work = query.data;
  if (work.everyProject)
    return (
      <div className="work-every">
        <Text>{t(own ? 'every_own' : 'every_other')}</Text>
        {projectLinks && (
          <div>
            <LinkButton variant="secondary" startIcon="folder" to="/admin/projects">
              {t('all_projects')}
            </LinkButton>
          </div>
        )}
      </div>
    );
  if (work.years.length === 0) return <EmptyState title={t(own ? 'empty_own' : 'empty_other')} />;
  return (
    <div className="work-years">
      <Text tone="muted">{t('decisions_note')}</Text>
      {work.years.map((y) => (
        <section key={y.year} className="work-year" aria-labelledby={`work-year-${y.year}`}>
          <h3 id={`work-year-${y.year}`} className="work-year-title">
            {t('year', { year: String(y.year) })}
          </h3>
          <ul className="work-list">
            {y.projects.map((p) => (
              <li key={p.id}>
                <ProjectCard project={p} own={own} link={projectLinks} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function ProjectCard({
  project: p,
  own,
  link,
}: {
  project: ProjectWork;
  own: boolean;
  link: boolean;
}) {
  const t = useTranslations('registration.profile.work');
  const locale = useLocale() as Locale;
  const titleId = useId();
  const name = localized(p.name, locale);
  const window =
    p.applyFrom || p.applyTo
      ? t('window_value', {
          from: p.applyFrom ? formatDate(p.applyFrom) : '—',
          to: p.applyTo ? formatDate(p.applyTo) : '—',
        })
      : t('no_window');
  const median = p.figures.mine.medianDays;
  return (
    <Card>
      <article aria-labelledby={titleId} className="work-card-body">
        <div className="work-card-head">
          <h4 id={titleId} className="work-card-title">
            {link ? <Link to={`/admin/projects/${p.id}`}>{name}</Link> : name}
          </h4>
          <ProjectStatusBadge status={p.status} />
        </div>
        <dl className="work-meta">
          <div>
            <dt>{t('code')}</dt>
            <dd lang="en">{p.code}</dd>
          </div>
          <div>
            <dt>{t('program')}</dt>
            <dd>{localized(p.program.name, locale)}</dd>
          </div>
          <div>
            <dt>{t('roles')}</dt>
            <dd>{p.roles.map((r) => localized(r.name, locale)).join(', ')}</dd>
          </div>
          <div>
            <dt>{t('areas')}</dt>
            <dd>
              {p.wholeProject
                ? t('whole_project')
                : p.areas.map((a) => localized(a.name, locale)).join(', ')}
            </dd>
          </div>
          <div>
            <dt>{t('window')}</dt>
            <dd>{window}</dd>
          </div>
        </dl>
        <Figures
          title={t('area_title')}
          items={AREA.map((key) => ({
            key,
            label: t(`area.${key}`),
            // eslint-disable-next-line security/detect-object-injection -- a fixed list of figure names
            value: formatCount(p.figures.area[key], locale),
          }))}
        />
        <Figures
          title={t(own ? 'mine_title_own' : 'mine_title_other')}
          items={[
            ...MINE.map((key) => ({
              key,
              label: t(`mine.${key}`),
              // eslint-disable-next-line security/detect-object-injection -- a fixed list of figure names
              value: formatCount(p.figures.mine[key], locale),
            })),
            {
              key: 'median',
              label: t('mine.median'),
              value:
                median === null
                  ? t('median_none')
                  : t('median_value', { days: formatDecimal(median, 1, locale) }),
            },
          ]}
        />
      </article>
    </Card>
  );
}

function Figures({
  title,
  items,
}: {
  title: string;
  items: { key: string; label: string; value: string }[];
}) {
  const id = useId();
  return (
    <div className="work-group">
      <h5 id={id} className="work-group-title">
        {title}
      </h5>
      <dl className="work-figures" aria-labelledby={id}>
        {items.map((item) => (
          <div key={item.key} className="work-figure">
            <dt className="work-figure-label">{item.label}</dt>
            <dd className="work-figure-value">{item.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
