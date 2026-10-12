import { Select } from '@css/ui';
import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'use-intl';
import { locations } from './registration-api';

export interface Address {
  divisionId: string | null;
  districtId: string | null;
  upazilaId: string | null;
  unionId: string | null;
}

export const EMPTY_ADDRESS: Address = {
  divisionId: null,
  districtId: null,
  upazilaId: null,
  unionId: null,
};

const LEVELS = ['divisionId', 'districtId', 'upazilaId', 'unionId'] as const;

/**
 * The cascading address (division → district → upazila → union) from the public locations list
 * (DECISION_LOG D-083): each list follows the choice above it, and changing a level clears the
 * levels below.
 */
export function AddressFields({
  value,
  onChange,
  errors = {},
}: {
  value: Address;
  onChange: (next: Address) => void;
  errors?: Record<string, string | undefined>;
}) {
  const t = useTranslations('registration.form');
  const locale = useLocale();
  const parents = [undefined, value.divisionId, value.districtId, value.upazilaId];
  const labels = [t('division'), t('district'), t('upazila'), t('union')];
  const lists = [
    useLevel(undefined, true),
    useLevel(parents[1] ?? undefined, Boolean(parents[1])),
    useLevel(parents[2] ?? undefined, Boolean(parents[2])),
    useLevel(parents[3] ?? undefined, Boolean(parents[3])),
  ];
  return (
    <>
      {LEVELS.map((level, i) => (
        <Select
          key={level}
          label={labels[i]!}
          name={level}
          required
          value={value[level]}
          disabled={i > 0 && !parents[i]}
          error={errors[level]}
          options={(lists[i] ?? []).map((l) => ({ id: l.id, label: l.name[locale] }))}
          onChange={(id) => {
            const next = { ...value, [level]: id };
            for (const lower of LEVELS.slice(i + 1)) next[lower] = null;
            onChange(next);
          }}
        />
      ))}
    </>
  );
}

/** The children of a level; a level whose parent is not chosen yet has no list (not the cache). */
function useLevel(parentId: string | undefined, enabled: boolean) {
  const data = useQuery({
    queryKey: ['locations', parentId ?? 'divisions'],
    queryFn: () => locations(parentId),
    enabled,
    staleTime: 60 * 60_000,
  }).data;
  return enabled ? data : undefined;
}
