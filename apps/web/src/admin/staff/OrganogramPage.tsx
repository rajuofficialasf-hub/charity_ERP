import { formatPercent } from '@css/shared/format';
import { type Locale, localized } from '@css/shared/i18n';
import { Button, Chip, EmptyState, Icon, IconButton, Page, SelectField, Skeleton } from '@/ui';
import { PersonAvatar } from '../../components/PersonPhoto';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'use-intl';
import { DocumentTitle } from '../../components/DocumentTitle';
import { useAuth } from '../../lib/auth';
import { ForbiddenContent } from '../AdminLayout';
import { canSeeStaff, GLOBAL_ROLES, TOP_ROLES } from '../roles';
import { StatisticsBar } from '../StatisticsBar';
import './organogram.css';
import { type Organogram, type OrganogramNode, organogram, STAFF_KEY } from './staff-api';
import './staff.css';
import { StaffViewSwitch } from './StaffViewSwitch';
import { PageCrumbs } from '../../components/shell/breadcrumb';
import { LoadError } from '../../components/LoadError';

const ALL = 'all';
/** The zoom of the chart: never below 40 %, never above 150 %, in steps of 10 %. */
const MIN_ZOOM = 0.4;
const MAX_ZOOM = 1.5;
const ZOOM_STEP = 0.1;
/** The inner padding of the canvas from 768 px (--space-5), left free when the chart is fitted. */
const PADDING = 24;

/** The colour band of a card by the highest role: leadership, PM, RPM, field staff. */
function tone(roles: string[]): 'lead' | 'pm' | 'rpm' | 'field' {
  if (GLOBAL_ROLES.some((role) => roles.includes(role))) return 'lead';
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
 * The department's organogram (docs/ui/SCREENS.md "Organogram") as a chart: the Department
 * Head on top; one level below, the Monitoring Team (who report to the Head) beside a branch per
 * program; every official under the supervisor, each branch folded or opened with the button
 * under its card; the last level stands in a column, so a wide team stays narrow. The server
 * computes it from roles, home programs, the programs' PMs and supervisors and leaves out other
 * departments and outside partners. On a phone the same lists read as an indented tree.
 */
export function OrganogramPage() {
  const { me } = useAuth();
  const t = useTranslations('admin.staff.chart');
  const ts = useTranslations('admin.staff');
  const locale = useLocale() as Locale;
  const allowed = Boolean(me && canSeeStaff(me));
  const [program, setProgram] = useState<string>(ALL);
  const [folded, setFolded] = useState<Set<string>>(new Set());
  const chart = useQuery({
    queryKey: [...STAFF_KEY, 'organogram'],
    queryFn: organogram,
    enabled: allowed,
  });
  const canvas = useRef<HTMLElement>(null);
  const tree = useRef<HTMLUListElement>(null);
  // the chart follows the width of the screen until the person zooms in or out
  const [zoom, setZoom] = useState(1);
  const [fitting, setFitting] = useState(true);
  const zoomNow = useRef(1);
  // the zoom as drawn now, for the measurement of the chart (before the fit below runs)
  useEffect(() => {
    zoomNow.current = zoom;
  }, [zoom]);
  useEffect(() => {
    const box = canvas.current;
    const list = tree.current;
    if (!box || !list || !fitting) return;
    // an old browser without these keeps the chart at its size and lets it scroll
    if (typeof window.matchMedia !== 'function' || typeof ResizeObserver === 'undefined') return;
    const desktop = window.matchMedia('(min-width: 768px)');
    const fit = () => {
      // a phone reads the indented tree at its own size
      if (!desktop.matches) return setZoom(1);
      const natural = list.getBoundingClientRect().width / zoomNow.current;
      const room = box.clientWidth - 2 * PADDING;
      setZoom(natural > room ? Math.max(MIN_ZOOM, Math.floor((room / natural) * 20) / 20) : 1);
    };
    fit();
    const watch = new ResizeObserver(fit);
    watch.observe(box);
    return () => watch.disconnect();
  }, [chart.data, program, folded, fitting]);
  // a chart still wider than the screen opens at its centre, where the leadership stands
  useEffect(() => {
    const el = canvas.current;
    if (el && chart.data) el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
  }, [chart.data, zoom]);
  const zoomBy = (step: number) => {
    setFitting(false);
    setZoom((z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round((z + step) * 20) / 20)));
  };
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
        <PersonAvatar name={n.displayName} fileId={n.photoFileId} size="md" />
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
            <Chip tone="warning">
              {n.state === 'pending' ? t('state.pending') : t('state.blocked')}
            </Chip>
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
            <Icon name={isFolded ? 'add' : 'minus'} size={14} />
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
    if (chart.error) return <LoadError error={chart.error} onRetry={() => void chart.refetch()} />;
    const { leadership, programs, unplaced } = chart.data;
    if (!leadership.length && !programs.length && !unplaced.length)
      return <EmptyState title={t('empty')} />;
    const shown = program === ALL ? programs : programs.filter((p) => p.programId === program);
    // an Admin and the Department Head on top; the Monitoring Team reports to the Head and stands
    // beside the programs, one level below (owner, 2026-10-17)
    const atTop = (n: { roles: string[] }) => TOP_ROLES.some((role) => n.roles.includes(role));
    const heads = leadership.filter(atTop);
    const monitoring = leadership.filter((n) => !atTop(n));
    const showMonitoring = program === ALL && monitoring.length > 0;
    const groups = showMonitoring ? 1 : 0;
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
          <SelectField
            label={t('program')}
            value={program}
            onChange={(id) => setProgram(id || ALL)}
            options={[
              { value: ALL, label: t('all_programs') },
              ...programs.map((p) => ({ value: p.programId, label: localized(p.name, locale) })),
            ]}
          />
          <div className="org-actions">
            <span className="org-zoom" role="group" aria-label={t('zoom')}>
              <IconButton
                label={t('zoom_out')}
                icon="zoom-out"

                onClick={() => zoomBy(-ZOOM_STEP)}
                disabled={zoom <= MIN_ZOOM}
              />
              <span className="org-zoom-value" aria-live="polite">
                {formatPercent(zoom, locale)}
              </span>
              <IconButton
                label={t('zoom_in')}
                icon="zoom-in"

                onClick={() => zoomBy(ZOOM_STEP)}
                disabled={zoom >= MAX_ZOOM}
              />
              <IconButton
                label={t('zoom_fit')}
                icon="maximize"

                onClick={() => setFitting(true)}
              />
            </span>
            <Button
              variant="secondary"
              size="small"
              startIcon="sort"
              onClick={() => setFolded(new Set())}
            >
              {t('open_all')}
            </Button>
            <Button
              variant="secondary"
              size="small"
              startIcon="collapse"
              onClick={() => setFolded(new Set(foldable))}
            >
              {t('fold_all')}
            </Button>
          </div>
        </div>
        <section ref={canvas} className="org-canvas" aria-label={t('title')} tabIndex={0}>
          <ul ref={tree} className="org-tree" style={{ zoom }}>
            <li>
              {heads.map((n) => (
                <div key={n.userId} className="org-root">
                  {card(n, false)}
                </div>
              ))}
              {(groups > 0 || shown.length > 0) && (
                <ul
                  className={heads.length ? 'org-level' : 'org-level org-level-top'}
                  aria-label={t('under_head')}
                >
                  {showMonitoring && (
                    <li>
                      <div className="org-program org-group-monitoring">
                        <strong>{t('monitoring')}</strong>
                        <span>{t('members', { count: String(monitoring.length) })}</span>
                      </div>
                      {branch(monitoring, t('monitoring'))}
                    </li>
                  )}
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
      <PageCrumbs
        items={[
          { id: 'staff', label: ts('title'), href: '/admin/staff' },
          { id: 'chart', label: t('title') },
        ]}
      />
      <Page title={t('title')} actions={<StaffViewSwitch value="chart" />} documentTitle={false} />
      {content()}
    </>
  );
}
