import type { ActiveFilter } from '@css/ui';
import { useLocale, useTranslations } from 'use-intl';
import { useLocationName } from '../components/AddressNames';

interface Area {
  divisionId?: string | undefined;
  districtId?: string | undefined;
  upazilaId?: string | undefined;
  unionId?: string | undefined;
}

/**
 * The area filters of a tab as removable chips ("বিভাগ: ঢাকা"); removing a level removes the levels
 * under it, as the address cascade does.
 */
export function useAreaChips(area: Area, change: (patch: Area) => void): ActiveFilter[] {
  const t = useTranslations('registration.form');
  const locale = useLocale() as 'bn' | 'en';
  const names = [
    useLocationName(undefined, area.divisionId ?? null),
    useLocationName(area.divisionId ?? null, area.districtId ?? null),
    useLocationName(area.districtId ?? null, area.upazilaId ?? null),
    useLocationName(area.upazilaId ?? null, area.unionId ?? null),
  ];
  const levels = [
    { key: 'divisionId', label: t('division') },
    { key: 'districtId', label: t('district') },
    { key: 'upazilaId', label: t('upazila') },
    { key: 'unionId', label: t('union') },
  ] as const;
  return levels.flatMap((level, i) => {
    const id = area[level.key];
    if (!id) return [];
    // eslint-disable-next-line security/detect-object-injection -- index of a fixed list
    const name = names[i]?.[locale] ?? '…';
    const below = Object.fromEntries(levels.slice(i).map((l) => [l.key, undefined])) as Area;
    return [{ id: level.key, label: `${level.label}: ${name}`, onRemove: () => change(below) }];
  });
}
