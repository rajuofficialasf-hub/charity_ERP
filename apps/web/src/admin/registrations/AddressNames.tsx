import type { Locale } from '@css/shared/i18n';
import { useLocale } from 'use-intl';
import { useLocationName } from './registrations-api';

export interface AddressIds {
  divisionId: string | null;
  districtId: string | null;
  upazilaId: string | null;
  unionId: string | null;
}

/** An address as "union, upazila, district, division" in the user's language. */
export function AddressNames({ address }: { address: AddressIds }) {
  const locale = useLocale() as Locale;
  const names = [
    useLocationName(address.upazilaId, address.unionId),
    useLocationName(address.districtId, address.upazilaId),
    useLocationName(address.divisionId, address.districtId),
    useLocationName(undefined, address.divisionId),
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
