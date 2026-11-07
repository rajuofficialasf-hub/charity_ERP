import { localized, type Locale } from '@css/shared/i18n';
import { Alert, IconButton } from '@/ui';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useLocale, useTranslations } from 'use-intl';
import {
  type Address,
  AddressFields,
  EMPTY_ADDRESS,
} from '../../../features/registration/AddressFields';
import { ApiFailure } from '../../../lib/api';
import { type PanelUser, UserSearch } from '../../UserSearch';
import { addArea, type Area, candidates, removeArea } from './setup-api';
import { SaveRow, SetupSection, useSetup, useStepSave } from './setup-context';

/**
 * The project's areas, each a division or a district with its RPM; a district may be split among
 * RPMs. An area whose location still carries staff access stays until that access ends.
 */
export function AreasSection({ areas }: { areas: Area[] }) {
  const { project, editable, refresh } = useSetup();
  const t = useTranslations('admin.projects.setup');
  const tz = useTranslations('admin.projects.wizard');
  const locale = useLocale() as Locale;
  const [place, setPlace] = useState<Address>(EMPTY_ADDRESS);
  const [rpm, setRpm] = useState<PanelUser | null>(null);
  const can = editable('areas');

  const add = useMutation({
    mutationFn: () =>
      addArea(project.id, {
        locationId: (place.districtId ?? place.divisionId)!,
        rpmUserId: rpm!.id,
      }),
    onSuccess: () => {
      setPlace(EMPTY_ADDRESS);
      setRpm(null);
      refresh();
    },
  });
  const remove = useMutation({ mutationFn: removeArea, onSuccess: refresh });
  // an area filled in but not added yet is added when the wizard moves on; half of one stays
  const problem = useStepSave({
    changed: can && Boolean(place.divisionId || rpm),
    invalid: place.divisionId && rpm ? undefined : tz('area_incomplete'),
    save: () => add.mutateAsync(),
  });

  return (
    <SetupSection id="areas" title={t('section.areas')}>
      {areas.length === 0 ? (
        <p className="admin-muted">{t('no_areas')}</p>
      ) : (
        <ul className="admin-setup-list">
          {areas.map((a) => (
            <li key={a.id}>
              <span>
                <strong>{localized(a.locationName, locale)}</strong> · {t(`level.${a.level}`)} ·{' '}
                {a.rpmName}
              </span>
              {can && (
                <IconButton
                  label={t('remove_area', { name: localized(a.locationName, locale) })}
                  icon="delete"

                  disabled={remove.isPending && remove.variables === a.id}
                  onClick={() => remove.mutate(a.id)}
                />
              )}
            </li>
          ))}
        </ul>
      )}
      {remove.error instanceof ApiFailure && <Alert tone="error">{remove.error.message}</Alert>}
      {can && (
        <>
          <h3 className="admin-setup-subtitle">{t('add_area')}</h3>
          <div className="admin-setup-grid">
            <AddressFields optional levels={2} value={place} onChange={setPlace} />
            <UserSearch
              label={t('rpm')}
              helper={t('rpm_hint')}
              selected={rpm}
              onSelect={setRpm}
              search={{
                key: `rpm:${project.id}`,
                find: (q) => candidates(project.id, 'regional_program_manager', q),
              }}
            />
          </div>
          {problem && <Alert tone="warning">{problem}</Alert>}
          <SaveRow
            mutation={add}
            onSave={() => add.mutate()}
            disabled={!place.divisionId || !rpm}
            label={t('add_area')}
          />
        </>
      )}
    </SetupSection>
  );
}
