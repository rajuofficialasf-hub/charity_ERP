import { Card, EmptyState, PageHeader, Text } from '@css/ui';
import { KeyRound } from 'lucide-react';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { DocumentTitle } from '../../components/DocumentTitle';
import { useAuth } from '../../lib/auth';
import { ForbiddenContent } from '../AdminLayout';
import { canManagePermissions } from '../roles';
import { type PanelUser, UserSearch } from '../UserSearch';
import { EffectivePermissions } from './EffectivePermissions';

/**
 * The permission panel (SCR-062, RBAC.md 7): the Department Head and the Monitoring Team find a
 * user, see the roles (read only, O-61) and the effective permissions, grant or remove a
 * permission and end a panel grant. The API checks `permission.panel.manage` on every change;
 * this page only decides what to show. The rule of the least access stands beside the search.
 */
export function PermissionsPage() {
  const { me } = useAuth();
  const t = useTranslations('admin.permissions');
  const [selected, setSelected] = useState<PanelUser | null>(null);
  if (!me) return null;
  if (!canManagePermissions(me)) return <ForbiddenContent />;
  return (
    <>
      <DocumentTitle title={t('title')} />
      <PageHeader eyebrow={t('eyebrow')} title={t('title')} description={t('description')} />
      <div className="page-split">
        <div className="page-split-main">
          <Card>
            <div className="admin-panel-section">
              <UserSearch
                label={t('search')}
                helper={t('search_hint')}
                selected={selected}
                onSelect={setSelected}
              />
              {!selected && (
                <EmptyState
                  icon={KeyRound}
                  title={t('pick_title')}
                  message={t('pick_message')}
                  headingLevel={2}
                />
              )}
            </div>
          </Card>
          {selected && (
            <Card>
              <EffectivePermissions key={selected.id} user={selected} />
            </Card>
          )}
        </div>
        <aside className="page-split-side" aria-label={t('rule.title')}>
          <Card accent title={t('rule.title')} headingLevel={2}>
            <Text tone="muted">{t('rule.body')}</Text>
          </Card>
        </aside>
      </div>
    </>
  );
}
