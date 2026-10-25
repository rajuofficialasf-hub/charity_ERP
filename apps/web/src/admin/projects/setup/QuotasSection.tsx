import { formatCount } from '@css/shared/format';
import { localized, type Locale } from '@css/shared/i18n';
import { Alert, Button, Text } from '@css/ui';
import { useMutation } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useLocale, useTranslations } from 'use-intl';
import {
  type Address,
  AddressFields,
  EMPTY_ADDRESS,
} from '../../../features/registration/AddressFields';
import { useLocationName } from '../../../components/AddressNames';
import { NumberText } from '../../forms/NumberText';
import { type Quota, saveQuotas } from './setup-api';
import { SaveRow, SetupSection, useSetup, useStepSave } from './setup-context';

type Draft = {
  level: 'district' | 'union';
  locationId: string;
  target: number | undefined;
  /** The place above a place added in this visit, to read its name from the locations. */
  parentId?: string;
};

const sameList = (a: readonly Draft[], b: readonly Quota[]) =>
  a.length === b.length &&
  a.every((q, i) => q.locationId === b[i]?.locationId && q.target === b[i]?.target);

/**
 * The district and union quotas of the project (DECISION_LOG D-132), set by the PM of the
 * program: each place with its target and, once applications arrive, what came and what was
 * approved. A full quota only warns at the review; the list is saved as a whole.
 */
export function QuotasSection({ quotas, manage }: { quotas: Quota[]; manage: boolean }) {
  const { project, editable, refresh } = useSetup();
  const t = useTranslations('admin.projects.setup');
  const can = manage && editable('quotas');
  const [list, setList] = useState<Draft[]>(() => quotas.map(draftOf));
  const [seen, setSeen] = useState(quotas);
  if (quotas !== seen) {
    setSeen(quotas);
    setList(quotas.map(draftOf));
  }
  const [place, setPlace] = useState<Address>(EMPTY_ADDRESS);
  const [target, setTarget] = useState<number | undefined>(undefined);
  const save = useMutation({
    mutationFn: () =>
      saveQuotas(project.id, {
        quotas: list.map((q) => ({
          level: q.level,
          locationId: q.locationId,
          target: q.target ?? 0,
        })),
      }),
    onSuccess: refresh,
  });
  const changed = can && !sameList(list, quotas);
  const incomplete = list.some((q) => q.target === undefined);
  const problem = useStepSave({
    changed,
    invalid: incomplete ? t('quota_incomplete') : undefined,
    save: () => save.mutateAsync(),
  });
  const chosen = place.unionId ?? place.districtId;
  const add = () => {
    if (!chosen || target === undefined || list.some((q) => q.locationId === chosen)) return;
    const union = Boolean(place.unionId);
    setList([
      ...list,
      {
        level: union ? 'union' : 'district',
        locationId: chosen,
        target,
        parentId: (union ? place.upazilaId : place.divisionId) ?? undefined,
      },
    ]);
    setPlace(EMPTY_ADDRESS);
    setTarget(undefined);
  };
  const progress = new Map(quotas.map((q) => [q.locationId, q]));

  return (
    <SetupSection id="quotas" title={t('section.quotas')}>
      <Text tone="muted">{t('quotas_hint')}</Text>
      {list.length === 0 ? (
        <p className="admin-muted">{t('no_quotas')}</p>
      ) : (
        <ul className="admin-setup-list">
          {list.map((q) => (
            <QuotaRow
              key={q.locationId}
              quota={q}
              stored={progress.get(q.locationId)}
              can={can}
              onTarget={(value) =>
                setList(
                  list.map((x) => (x.locationId === q.locationId ? { ...x, target: value } : x)),
                )
              }
              onRemove={() => setList(list.filter((x) => x.locationId !== q.locationId))}
            />
          ))}
        </ul>
      )}
      {can && (
        <>
          <h3 className="admin-setup-subtitle">{t('add_quota')}</h3>
          <div className="admin-setup-grid">
            <AddressFields optional levels={4} value={place} onChange={setPlace} />
            <NumberText label={t('quota_target')} integer value={target} onChange={setTarget} />
          </div>
          <div>
            <Button
              variant="secondary"
              size="sm"
              icon={Plus}
              disabled={!place.districtId || target === undefined}
              onPress={add}
            >
              {t('add_quota')}
            </Button>
          </div>
          {problem && (
            <Alert tone="warning" live="alert">
              {problem}
            </Alert>
          )}
          <SaveRow
            mutation={save}
            onSave={() => save.mutate()}
            disabled={!changed || incomplete}
            label={t('save_quotas')}
          />
        </>
      )}
    </SetupSection>
  );
}

const draftOf = (q: Quota): Draft => ({
  level: q.level,
  locationId: q.locationId,
  target: q.target,
});

/** One quota: the place, its target (editable by the PM), and what came and was approved. */
function QuotaRow({
  quota,
  stored,
  can,
  onTarget,
  onRemove,
}: {
  quota: Draft;
  stored: Quota | undefined;
  can: boolean;
  onTarget: (value: number | undefined) => void;
  onRemove: () => void;
}) {
  const t = useTranslations('admin.projects.setup');
  const locale = useLocale() as Locale;
  // a place added in this visit has no stored name yet; its name is read from the locations
  const looked = useLocationName(
    stored ? null : (quota.parentId ?? null),
    stored ? null : quota.locationId,
  );
  const name = stored ? localized(stored.locationName, locale) : (looked?.[locale] ?? '');
  return (
    <li>
      <span>
        <strong>{name}</strong> · {t(`level.${quota.level}`)}
        {stored ? (
          <>
            {' · '}
            <span className="admin-muted">
              {t('quota_progress', {
                target: formatCount(stored.target, locale),
                received: formatCount(stored.received, locale),
                approved: formatCount(stored.approved, locale),
              })}
            </span>
          </>
        ) : null}
      </span>
      {can ? (
        <span className="admin-setup-quota-edit">
          <NumberText
            label={t('quota_target_of', { name })}
            integer
            value={quota.target}
            onChange={onTarget}
          />
          <Button variant="ghost" size="sm" icon={Trash2} iconOnly onPress={onRemove}>
            {t('remove_quota', { name })}
          </Button>
        </span>
      ) : null}
    </li>
  );
}
