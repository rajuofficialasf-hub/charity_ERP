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
 * this page only decides what to show.
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
      <h1 className="admin-title">{t('title')}</h1>
      <p className="m-0">{t('intro')}</p>
      <UserSearch
        label={t('search')}
        helper={t('search_hint')}
        selected={selected}
        onSelect={setSelected}
      />
      {selected && <EffectivePermissions key={selected.id} user={selected} />}
    </>
  );
}
