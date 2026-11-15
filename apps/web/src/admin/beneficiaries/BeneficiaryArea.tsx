import type { Locale } from '@css/shared/i18n';
import { useLocale } from 'use-intl';
import { useLocationName } from '../../components/AddressNames';
import type { BeneficiaryProfile } from './beneficiaries-api';

type Area = Pick<BeneficiaryProfile, 'divisionId' | 'districtId' | 'upazilaId' | 'unionId'>;

/** The union (when sent), the upazila and the district of a beneficiary, and the division unless `short`. */
export function useAreaText(p: Area, short = false): string {
  const locale = useLocale() as Locale;
  const names = [
    useLocationName(p.upazilaId, p.unionId ?? null),
    useLocationName(p.districtId, p.upazilaId),
    useLocationName(p.divisionId, p.districtId),
    useLocationName(undefined, p.divisionId),
  ];
  return (short ? names.slice(0, 3) : names)
    .map((n) => n?.[locale])
    .filter(Boolean)
    .join(', ');
}

/** The union (when sent), the upazila, the district and the division of a beneficiary. */
export function BeneficiaryArea({ profile }: { profile: Area }) {
  return <>{useAreaText(profile)}</>;
}
