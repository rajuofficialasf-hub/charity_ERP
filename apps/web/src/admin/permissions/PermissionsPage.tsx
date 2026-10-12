import { Combobox } from '@css/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { DocumentTitle } from '../../components/DocumentTitle';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { ForbiddenContent } from '../AdminLayout';
import { PERMISSION_PANEL_ROLES } from '../navigation';
import { EffectivePermissions, type PanelUser } from './EffectivePermissions';

const MIN_SEARCH = 2;

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
  if (!me.roles.some((role) => PERMISSION_PANEL_ROLES.includes(role))) return <ForbiddenContent />;
  return (
    <>
      <DocumentTitle title={t('title')} />
      <h1 className="admin-title">{t('title')}</h1>
      <p className="m-0">{t('intro')}</p>
      <UserSearch selected={selected} onSelect={setSelected} />
      {selected && <EffectivePermissions key={selected.id} user={selected} />}
    </>
  );
}

function UserSearch({
  selected,
  onSelect,
}: {
  selected: PanelUser | null;
  onSelect: (user: PanelUser | null) => void;
}) {
  const t = useTranslations('admin.permissions');
  const [text, setText] = useState('');
  // the user list sends the designation, not the contact details
  const label = (u: PanelUser) =>
    u.designation
      ? t('user_option', { name: u.displayName, detail: u.designation })
      : u.displayName;
  const searching = text.trim().length >= MIN_SEARCH && (!selected || text !== label(selected));
  const results = useQuery({
    queryKey: ['admin', 'user-search', text.trim()],
    queryFn: () =>
      api<PanelUser[]>(`/users?limit=20&q=${encodeURIComponent(text.trim().slice(0, 100))}`),
    enabled: searching,
  });
  // the chosen user stays an option while the text shows its label
  const users = [
    ...(selected ? [selected] : []),
    ...(results.data ?? []).filter((u) => u.id !== selected?.id),
  ];
  return (
    <Combobox
      label={t('search')}
      helper={t('search_hint')}
      options={users.map((u) => ({ id: u.id, label: label(u) }))}
      value={selected?.id ?? null}
      onInputChange={setText}
      serverSearch
      onChange={(id) => onSelect(users.find((u) => u.id === id) ?? null)}
    />
  );
}
