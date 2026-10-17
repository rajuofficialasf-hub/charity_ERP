import { type Locale, localized } from '@css/shared/i18n';
import {
  Avatar,
  Badge,
  Breadcrumb,
  Button,
  EmptyState,
  ErrorState,
  Select,
  Skeleton,
} from '@css/ui';
import { useQuery } from '@tanstack/react-query';
import { ChevronsDownUp, ChevronsUpDown, Minus, Network, Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'use-intl';
import { DocumentTitle } from '../../components/DocumentTitle';
import { ApiFailure } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { ForbiddenContent } from '../AdminLayout';
import { canSeeStaff } from '../roles';
import { StatisticsBar } from '../StatisticsBar';
import './organogram.css';
import { type Organogram, type OrganogramNode, organogram, STAFF_KEY } from './staff-api';
import './staff.css';
import { StaffViewSwitch } from './StaffViewSwitch';

const ALL = 'all';

/** The colour band of a card by the highest role: leadership, PM, RPM, field staff. */
function tone(roles: string[]): 'lead' | 'pm' | 'rpm' | 'field' {
  if (roles.includes('department_head') || roles.includes('monitoring_team')) return 'lead';
  if (roles.includes('program_manager')) return 'pm';
  if (roles.includes('regional_program_manager')) return 'rpm';
  return 'field';
}

/** Every official of the chart with reports, to open or fold them all at once. */
function withReports(chart: Organogram): string[] {
  const out: string[] = [];
  const walk = (nodes: OrganogramNode[]) => {
    for (const n of nodes) {
      if (n.reports.length) out.push(n.userId);
      walk(n.reports);
    }
  };
  for (const p of chart.programs) walk(p.members);
  return out;
}

const count = (nodes: OrganogramNode[]): number =>
  nodes.reduce((sum, n) => sum + 1 + count(n.reports), 0);

/**
 * The department's organogram (DECISION_LOG D-097, BR-263, SCR-064) as a chart: the leadership on
 * top, a branch per program, and every official under the supervisor, each branch folded or opened
 * with the button under its card; the last level stands in a column, so a wide team stays narrow.
 * The server computes it from roles, home programs, the programs' PMs and supervisors and leaves out
 * other departments and outside partners. On a phone the same lists read as an indented tree.
 */
export function OrganogramPage() {
  const { me } = useAuth();
  const t = useTranslations('admin.staff.chart');
  const ts = useTranslations('admin.staff');
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;
  const allowed = Boolean(me && canSeeStaff(me));
  const [program, setProgram] = useState<string>(ALL);
  const [folded, setFolded] = useState<Set<string>>(new Set());
  const chart = useQuery({
    queryKey: [...STAFF_KEY, 'organogram'],
    queryFn: organogram,
    enabled: allowed,
  });
  // a chart wider than the screen opens at its centre, where the leadership stands
  const canvas = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = canvas.current;
    if (el && chart.data) el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
  }, [chart.data]);
  if (!me) return null;
  if (!allowed) return <ForbiddenContent />;
  const toggle = (id: string) =>
    setFolded((old) => {
      const next = new Set(old);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const card = (n: OrganogramNode, foldable: boolean) => {
    const isFolded = folded.has(n.userId);
    return (
      <div className={`org-card org-tone-${tone(n.roles)}`}>
        <Avatar name={n.displayName} size="md" />
        <div className="org-card-text">
          <strong>{n.displayName}</strong>
          {n.designation && <span className="org-meta">{n.designation}</span>}
          <span className="org-card-tags">
            {n.jobId && (
              <span className="staff-job" lang="en">
                {n.jobId}
              </span>
            )}
          </span>
          {n.state !== 'active' && (
            <Badge
              size="sm"
              tone="warning"
              label={n.state === 'pending' ? t('state.pending') : t('state.blocked')}
            />
          )}
        </div>
        {foldable && (
          <button
            type="button"
            className="org-toggle"
            aria-expanded={!isFolded}
            aria-label={
              isFolded ? t('show', { name: n.displayName }) : t('hide', { name: n.displayName })
            }
            onClick={() => toggle(n.userId)}
          >
            {isFolded ? <Plus aria-hidden size={14} /> : <Minus aria-hidden size={14} />}
          </button>
        )}
      </div>
    );
  };

  const branch = (nodes: OrganogramNode[], label: string) => {
    // a level of only leaves stands in a column, like the last level of a printed chart
    const column = nodes.length > 1 && nodes.every((n) => n.reports.length === 0);
    return (
      <ul className={column ? 'org-level org-stack' : 'org-level'} aria-label={label}>
        {nodes.map((n) => (
          <li key={n.userId}>
            {card(n, n.reports.length > 0)}
            {n.reports.length > 0 &&
              !folded.has(n.userId) &&
              branch(n.reports, t('reports', { name: n.displayName }))}
          </li>
        ))}
      </ul>
    );
  };

  const content = () => {
    if (chart.isPending) return <Skeleton shape="card" />;
    if (chart.error)
      return (
        <ErrorState
          title={tc('state.error.text')}
          requestId={chart.error instanceof ApiFailure ? chart.error.requestId : undefined}
          onRetry={() => void chart.refetch()}
        />
      );
    const { leadership, programs, unplaced } = chart.data;
    if (!leadership.length && !programs.length && !unplaced.length)
      return <EmptyState icon={Network} title={t('empty')} headingLevel={2} />;
    const shown = program === ALL ? programs : programs.filter((p) => p.programId === program);
    const foldable = withReports(chart.data);
    return (
      <>
        <StatisticsBar
          label={t('stats')}
          items={[
            {
              key: 'all',
              label: t('total'),
              value:
                count(leadership) +
                programs.reduce((sum, p) => sum + count(p.members), 0) +
                count(unplaced),
            },
            { key: 'programs', label: t('programs'), value: programs.length },
            { key: 'unplaced', label: t('unplaced'), value: count(unplaced) },
          ]}
        />
        <div className="org-toolbar">
          <Select
            label={t('program')}
            value={program}
            onChange={(id) => setProgram(id ?? ALL)}
            options={[
              { id: ALL, label: t('all_programs') },
              ...programs.map((p) => ({ id: p.programId, label: localized(p.name, locale) })),
            ]}
          />
          <div className="admin-title-actions">
            <Button
              variant="secondary"
              size="sm"
              icon={ChevronsUpDown}
              onPress={() => setFolded(new Set())}
            >
              {t('open_all')}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={ChevronsDownUp}
              onPress={() => setFolded(new Set(foldable))}
            >
              {t('fold_all')}
            </Button>
          </div>
        </div>
        <section ref={canvas} className="org-canvas" aria-label={t('title')} tabIndex={0}>
          <ul className="org-tree">
            <li>
              {leadership.length > 0 && (
                <div className="org-lead">
                  <h2 className="org-group-title">{t('leadership')}</h2>
                  <ul className="org-lead-row" aria-label={t('leadership')}>
                    {leadership.map((n) => (
                      <li key={n.userId}>{card(n, false)}</li>
                    ))}
                  </ul>
                </div>
              )}
              {shown.length > 0 && (
                <ul className="org-level" aria-label={t('programs')}>
                  {shown.map((p) => {
                    const name = `${localized(p.name, locale)} (${p.code})`;
                    return (
                      <li key={p.programId}>
                        <div className="org-program">
                          <strong>{localized(p.name, locale)}</strong>
                          <span lang="en">{p.code}</span>
                          <span>
                            {p.active
                              ? t('members', { count: String(count(p.members)) })
                              : t('inactive')}
                          </span>
                        </div>
                        {p.members.length ? (
                          branch(p.members, name)
                        ) : (
                          <p className="org-empty">{t('no_members')}</p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          </ul>
        </section>
        {unplaced.length > 0 && (
          <section className="org-unplaced" aria-labelledby="org-unplaced-title">
            <h2 id="org-unplaced-title" className="org-group-title">
              {t('unplaced')}
            </h2>
            <ul className="org-grid" aria-label={t('unplaced')}>
              {unplaced.map((n) => (
                <li key={n.userId}>{card(n, false)}</li>
              ))}
            </ul>
          </section>
        )}
      </>
    );
  };

  return (
    <>
      <DocumentTitle title={t('title')} />
      <Breadcrumb
        items={[
          { id: 'staff', label: ts('title'), href: '/admin/staff' },
          { id: 'chart', label: t('title') },
        ]}
      />
      <div className="admin-title-row">
        <h1 className="admin-title">{t('title')}</h1>
        <StaffViewSwitch value="chart" />
      </div>
      {content()}
    </>
  );
}
