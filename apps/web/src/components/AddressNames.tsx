import type { Locale } from '@css/shared/i18n';
import { useLocale } from 'use-intl';
import { useQuery } from '@tanstack/react-query';
import { locations } from '../features/registration/registration-api';
import { orCached } from '../lib/or-cached';

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

/** The children of a location from the server, or from the phone's locations master when the network is away. */
const childrenOf = (parentId: string | undefined) =>
  orCached(
    () => locations(parentId),
    async () => (await import('../offline/snapshot')).cachedChildren(parentId ?? null),
  );

/**
 * The name of one location, read from its parent's public list (the cache the address cascade
 * of the registration form uses); `parentId` undefined means the divisions.
 */
export function useLocationName(parentId: string | null | undefined, id: string | null) {
  const enabled = parentId !== null && id !== null;
  const list = useQuery({
    queryKey: ['locations', parentId ?? 'divisions'],
    queryFn: () => childrenOf(parentId ?? undefined),
    enabled,
    staleTime: 60 * 60_000,
  });
  return enabled ? list.data?.find((l) => l.id === id)?.name : undefined;
}
