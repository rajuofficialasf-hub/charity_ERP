import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'use-intl';
import { type Location, locations } from './registration-api';
import { SelectField } from '@/ui';

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
 * The cascading address (division → district → upazila → union) from the public locations list:
 * each list follows the choice above it, and changing a level clears the
 * levels below.
 */
export function AddressFields({
  value,
  onChange,
  errors = {},
  optional = false,
  labelSuffix = '',
  levels = 4,
  onUnionChosen,
}: {
  value: Address;
  onChange: (next: Address) => void;
  /** Told the union as it is chosen (null when the choice is cleared), for its post code. */
  onUnionChosen?: (union: Location | null) => void;
  errors?: Record<string, string | undefined>;
  /** The levels are not mandatory (the permanent address). */
  optional?: boolean;
  /** Told after each label when two addresses are on one page, e.g. "(permanent)". */
  labelSuffix?: string;
  /**
   * How many levels are offered (a filter that may not use the union stops at the upazila; a
   * project area is a division or a district; a division alone for a scope of the region).
   */
  levels?: 1 | 2 | 3 | 4;
}) {
  const t = useTranslations('registration.form');
  const locale = useLocale();
  const parents = [undefined, value.divisionId, value.districtId, value.upazilaId];
  const labels = [t('division'), t('district'), t('upazila'), t('union')].map((l) =>
    labelSuffix ? `${l} ${labelSuffix}` : l,
  );
  const lists = [
    useLevel(undefined),
    useLevel(value.divisionId),
    useLevel(value.districtId),
    useLevel(value.upazilaId),
  ];
  return (
    <>
      {LEVELS.slice(0, levels).map((level, i) => (
        <SelectField
          key={level}
          label={labels[i]!}
          name={labelSuffix ? `permanent-${level}` : level}
          required={!optional}
          value={value[level] ?? ''}
          // a list still loading cannot be opened empty
          disabled={(i > 0 && !parents[i]) || !lists[i]}
          // on a phone the next level opens by itself once the one above it is picked
          // a filter may stop at any level, so only an address that is asked for opens the next one
          autoOpen={!optional && i > 0}
          error={errors[labelSuffix ? `permanent-${level}` : level]}
          options={(lists[i] ?? []).map((l) => ({ value: l.id, label: l.name[locale] }))}
          onChange={(id) => {
            const next = { ...value, [level]: id || null };
            for (const lower of LEVELS.slice(i + 1)) next[lower] = null;
            onChange(next);
            if (level === 'unionId')
              onUnionChosen?.((lists[i] ?? []).find((l) => l.id === id) ?? null);
          }}
        />
      ))}
    </>
  );
}

/**
 * The read of a location's children from the public list, kept for an hour: the divisions for
 * `undefined`, and no read for `null` (a parent that is not chosen yet). A screen that must not
 * go on without the list reads its state from here.
 */
export function useLocationList(parentId: string | null | undefined) {
  return useQuery({
    queryKey: ['locations', parentId ?? 'divisions'],
    queryFn: () => locations(parentId ?? undefined),
    enabled: parentId !== null,
    staleTime: 60 * 60_000,
  });
}

/**
 * The children of a level: the divisions for `undefined`, nothing for a level whose parent is not
 * chosen yet (`null`; not the cached divisions).
 */
function useLevel(parentId: string | null | undefined) {
  const { data } = useLocationList(parentId);
  return parentId !== null ? data : undefined;
}
