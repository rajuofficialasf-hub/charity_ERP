import { Combobox } from '@/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { api } from '../api/client';
import type { PanelUser } from '../api/schemas';

export type { PanelUser };

const MIN_SEARCH = 2;

/** The users with one role, the first 50 by name (a role's people fit one list). */
export const usersWithRole = (role: string) => (text: string) =>
  api<PanelUser[]>(
    `/users?kind=staff&state=active&role=${role}&limit=50${text ? `&q=${encodeURIComponent(text)}` : ''}`,
  );

/**
 * Finds a user by name, email or mobile through the server search (GET /users; the permission
 * panel and the handover page), or through another search the caller gives (the officials a
 * project may be given). Opening the field lists the first ones by name before any text;
 * two letters narrow the list on the server. The option shows the
 * designation, not the contact details.
 */
export function UserSearch({
  label,
  helper,
  selected,
  onSelect,
  search,
}: {
  label: string;
  helper?: string;
  selected: PanelUser | null;
  onSelect: (user: PanelUser | null) => void;
  /** Another server search, with the key part that tells its results apart. */
  search?: { key: string; find: (text: string) => Promise<PanelUser[]> };
}) {
  const t = useTranslations('admin.permissions');
  const [text, setText] = useState('');
  const [opened, setOpened] = useState(false);
  const optionLabel = (u: PanelUser) =>
    u.designation
      ? t('user_option', { name: u.displayName, detail: u.designation })
      : u.displayName;
  const typed = text.trim().length >= MIN_SEARCH && (!selected || text !== optionLabel(selected));
  // until two letters are typed the list shows the first users by name
  const term = typed ? text.trim().slice(0, 100) : '';
  const results = useQuery({
    queryKey: ['admin', 'user-search', search?.key ?? 'users', term],
    queryFn: () =>
      search
        ? search.find(term)
        : api<PanelUser[]>(`/users?limit=20${term ? `&q=${encodeURIComponent(term)}` : ''}`),
    enabled: opened || typed,
  });
  // the chosen user stays an option while the text shows its label
  const users = [
    ...(selected ? [selected] : []),
    ...(results.data ?? []).filter((u) => u.id !== selected?.id),
  ];
  return (
    <Combobox
      label={label}
      hint={helper}
      options={users.map((u) => ({ value: u.id, label: optionLabel(u) }))}
      value={selected?.id ?? null}
      valueLabel={selected ? optionLabel(selected) : undefined}
      onInputChange={setText}
      serverSearch
      onOpen={() => setOpened(true)}
      loading={results.isFetching}
      onChange={(id) => onSelect(users.find((u) => u.id === id) ?? null)}
    />
  );
}
