import { AddressFields } from '../features/registration/AddressFields';

/** The four levels of a place a list filters by, as the address bar keeps them. */
export type AreaFilterValues = Partial<
  Record<'divisionId' | 'districtId' | 'upazilaId' | 'unionId', string>
>;

/**
 * The area of a list's filters: a division, then its district, upazila and union from the address
 * list, each optional; a level cleared drops the ones below it. The volunteer, beneficiary and
 * application lists share it.
 */
export function AreaFilter({
  legend,
  filters,
  change,
  levels,
}: {
  legend: string;
  /** How far down the place goes: the beneficiary list stops at the upazila unless asked. */
  levels?: 1 | 2 | 3 | 4;
  filters: AreaFilterValues;
  change: (next: { [K in keyof AreaFilterValues]: string | undefined }) => void;
}) {
  return (
    <fieldset className="admin-filter-group">
      <legend>{legend}</legend>
      <AddressFields
        optional
        levels={levels}
        value={{
          divisionId: filters.divisionId ?? null,
          districtId: filters.districtId ?? null,
          upazilaId: filters.upazilaId ?? null,
          unionId: filters.unionId ?? null,
        }}
        onChange={(a) =>
          change({
            divisionId: a.divisionId ?? undefined,
            districtId: a.districtId ?? undefined,
            upazilaId: a.upazilaId ?? undefined,
            unionId: a.unionId ?? undefined,
          })
        }
      />
    </fieldset>
  );
}
