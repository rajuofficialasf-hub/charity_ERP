import type { Locale } from '@css/shared/i18n';
import { useLocale } from 'use-intl';
import { useLocationName } from '../../components/AddressNames';
import type { BeneficiaryProfile } from './beneficiaries-api';

/** The union (when sent), the upazila, the district and the division of a beneficiary. */
export function BeneficiaryArea({
  profile: p,
}: {
  profile: Pick<BeneficiaryProfile, 'divisionId' | 'districtId' | 'upazilaId' | 'unionId'>;
}) {
  const locale = useLocale() as Locale;
  const names = [
    useLocationName(p.upazilaId, p.unionId ?? null),
    useLocationName(p.districtId, p.upazilaId),
    useLocationName(p.divisionId, p.districtId),
    useLocationName(undefined, p.divisionId),
  ];
  return (
    <>
      {names
        .map((n) => n?.[locale])
        .filter(Boolean)
        .join(', ')}
    </>
  );
}
