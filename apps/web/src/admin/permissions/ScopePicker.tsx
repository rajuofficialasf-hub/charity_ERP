import type { ScopeTypeName } from '@css/shared/access';
import { localized, type Locale } from '@css/shared/i18n';
import { SelectField, Text } from '@/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useLocale, useTranslations } from 'use-intl';
import {
  type Address,
  AddressFields,
  EMPTY_ADDRESS,
} from '../../features/registration/AddressFields';
import { PROGRAMS_KEY, programs } from '../programs/programs-api';
import { pickerProjects, PROJECTS_KEY } from '../projects/projects-api';

/** The address level a place scope names, and how many levels the address fields offer. */
const PLACE: Partial<Record<ScopeTypeName, { level: keyof Address; levels: 1 | 2 | 3 | 4 }>> = {
  REGION: { level: 'divisionId', levels: 1 },
  DISTRICT: { level: 'districtId', levels: 2 },
  UPAZILA: { level: 'upazilaId', levels: 3 },
  UNION: { level: 'unionId', levels: 4 },
};

/**
 * The instance a scope names, chosen by name (docs/ui/SCREENS.md "Permission panel"): a program
 * from the program list, a session of a project from the project list, or a division, district,
 * upazila or union through the address fields. The value is the id the request sends; the
 * caller gives this a `key` per scope type, so a new type starts empty.
 */
export function ScopePicker({
  scopeType,
  onChange,
  error,
}: {
  scopeType: ScopeTypeName;
  onChange: (scopeRef: string) => void;
  error?: string;
}) {
  const t = useTranslations('admin.permissions.dialog');
  const tp = useTranslations('admin.projects');
  const locale = useLocale() as Locale;
  const [chosen, setChosen] = useState('');
  const [address, setAddress] = useState<Address>(EMPTY_ADDRESS);
  const programList = useQuery({
    queryKey: PROGRAMS_KEY,
    queryFn: programs,
    enabled: scopeType === 'PROGRAM',
  });
  const projectList = useQuery({
    queryKey: [...PROJECTS_KEY, 'picker'],
    queryFn: pickerProjects,
    enabled: scopeType === 'PROJECT',
  });
  const pick = (id: string) => {
    setChosen(id);
    onChange(id);
  };

  if (scopeType === 'PROGRAM' || scopeType === 'PROJECT') {
    const options =
      scopeType === 'PROGRAM'
        ? (programList.data ?? []).map((p) => ({
            value: p.id,
            label: `${localized(p.name, locale)} (${p.code})`,
          }))
        : (projectList.data ?? []).map((p) => ({
            value: p.id,
            label: tp('picker_option', {
              name: localized(p.name, locale),
              label: p.sessionLabel,
              code: p.code,
            }),
          }));
    return (
      <SelectField
        label={scopeType === 'PROGRAM' ? t('program') : t('project')}
        required
        value={chosen}
        onChange={(id) => pick(id ?? '')}
        options={options}
        error={error}
      />
    );
  }
  const place = PLACE[scopeType];
  if (!place) return null;
  return (
    <>
      <AddressFields
        optional
        levels={place.levels}
        value={address}
        onChange={(next) => {
          setAddress(next);
          pick(next[place.level] ?? '');
        }}
      />
      {error && <Text tone="error">{error}</Text>}
    </>
  );
}
