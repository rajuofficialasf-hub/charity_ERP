import { type Locale, localized } from '@css/shared/i18n';
import { Badge, Card, EmptyState, ErrorState, Skeleton } from '@css/ui';
import { useQuery } from '@tanstack/react-query';
import { Network } from 'lucide-react';
import { Link } from 'react-router';
import { useLocale, useTranslations } from 'use-intl';
import { DocumentTitle } from '../../components/DocumentTitle';
import { ApiFailure } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { ForbiddenContent } from '../AdminLayout';
import { roles } from '../registrations/registrations-api';
import { canSeeStaff } from '../roles';
import './organogram.css';
import { type OrganogramNode, organogram, STAFF_KEY } from './staff-api';

/**
 * The department's organogram (DECISION_LOG D-097, BR-263, SCR-066): the global roles on top,
 * then one card per program with its officials under their supervisor, then the officials without
 * a place. The server computes it from roles, home programs, the programs' PMs and supervisors and
 * leaves out other departments and outside partners; it is never drawn by hand. Nested lists read
 * the same on a phone and on a desktop, where the programs sit side by side.
 */
export function OrganogramPage() {
  const { me } = useAuth();
  const t = useTranslations('admin.staff.chart');
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;
  const allowed = Boolean(me && canSeeStaff(me));
  const chart = useQuery({
    queryKey: [...STAFF_KEY, 'organogram'],
    queryFn: organogram,
    enabled: allowed,
  });
  const roleList = useQuery({ queryKey: ['admin', 'roles'], queryFn: roles, enabled: allowed });
  if (!me) return null;
  if (!allowed) return <ForbiddenContent />;
  const roleName = (key: string) => {
    const role = roleList.data?.find((r) => r.key === key);
    return role ? localized(role.name, locale) : key;
  };

  const tree = (nodes: OrganogramNode[], label: string) => (
    <ul className="org-tree" aria-label={label}>
      {nodes.map((n) => (
        <li key={n.userId}>
          <div className="org-node">
            <strong>{n.displayName}</strong>
            <span className="org-meta">{[n.jobId, n.designation].filter(Boolean).join(' · ')}</span>
            <span className="org-meta">{n.roles.map(roleName).join(', ')}</span>
            {n.state !== 'active' && (
              <Badge
                size="sm"
                tone="warning"
                label={n.state === 'pending' ? t('state.pending') : t('state.blocked')}
              />
            )}
          </div>
          {n.reports.length > 0 && tree(n.reports, t('reports', { name: n.displayName }))}
        </li>
      ))}
    </ul>
  );

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
    return (
      <>
        {leadership.length > 0 && (
          <Card title={t('leadership')} headingLevel={2}>
            {tree(leadership, t('leadership'))}
          </Card>
        )}
        <div className="org-programs">
          {programs.map((p) => {
            const name = `${localized(p.name, locale)} (${p.code})`;
            return (
              <Card
                key={p.programId}
                title={name}
                subtitle={p.active ? undefined : t('inactive')}
                headingLevel={2}
              >
                {p.members.length ? (
                  tree(p.members, name)
                ) : (
                  <p className="m-0 admin-muted">{t('no_members')}</p>
                )}
              </Card>
            );
          })}
        </div>
        {unplaced.length > 0 && (
          <Card title={t('unplaced')} subtitle={t('unplaced_hint')} headingLevel={2}>
            {tree(unplaced, t('unplaced'))}
          </Card>
        )}
      </>
    );
  };

  return (
    <>
      <DocumentTitle title={t('title')} />
      <Link to="/admin/staff">{t('back')}</Link>
      <h1 className="admin-title">{t('title')}</h1>
      <p className="m-0 admin-muted">{t('intro')}</p>
      {content()}
    </>
  );
}
