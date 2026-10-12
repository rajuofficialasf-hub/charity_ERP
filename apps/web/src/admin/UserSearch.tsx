import { Combobox } from '@css/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { api } from '../lib/api';

/** A user as the user list returns it (GET /users). */
export interface PanelUser {
  id: string;
  displayName: string;
  designation: string | null;
  roles: string[];
}

const MIN_SEARCH = 2;

/**
 * Finds a user by name, email or mobile through the server search (GET /users; the permission
 * panel and the handover page). The option shows the designation, not the contact details.
 */
export function UserSearch({
  label,
  helper,
  selected,
  onSelect,
}: {
  label: string;
  helper?: string;
  selected: PanelUser | null;
  onSelect: (user: PanelUser | null) => void;
}) {
  const t = useTranslations('admin.permissions');
  const [text, setText] = useState('');
  const optionLabel = (u: PanelUser) =>
    u.designation
      ? t('user_option', { name: u.displayName, detail: u.designation })
      : u.displayName;
  const searching =
    text.trim().length >= MIN_SEARCH && (!selected || text !== optionLabel(selected));
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
      label={label}
      helper={helper}
      options={users.map((u) => ({ id: u.id, label: optionLabel(u) }))}
      value={selected?.id ?? null}
      onInputChange={setText}
      serverSearch
      onChange={(id) => onSelect(users.find((u) => u.id === id) ?? null)}
    />
  );
}
