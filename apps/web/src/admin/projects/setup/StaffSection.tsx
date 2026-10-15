import { localized, type Locale } from '@css/shared/i18n';
import { editableIn, STAFF_ACCESS_ROLES } from '@css/shared/projects';
import { Alert, Button, Checkbox, Modal, Select, TextArea } from '@css/ui';
import { useMutation } from '@tanstack/react-query';
import { UserMinus } from 'lucide-react';
import { useState } from 'react';
import { useLocale, useTranslations } from 'use-intl';
import { ApiFailure } from '../../../lib/api';
import { type PanelUser, UserSearch } from '../../UserSearch';
import { addStaff, type Area, candidates, endStaff, type StaffAccess } from './setup-api';
import { SaveRow, SetupSection, useSetup, useStepSave } from './setup-context';

/**
 * Staff access on the project: a Project Executive, an Official দায়ী or an Implementer gets view,
 * edit or delete access, in an area or on the whole project. An RPM gives view and edit in its own
 * areas; only the PM gives delete (DECISION_LOG D-095). Ending access takes a reason.
 */
export function StaffSection({
  staff,
  areas,
  manage,
}: {
  staff: StaffAccess[];
  areas: Area[];
  /** The caller gives access here: the PM and the global roles, or an RPM of the project. */
  manage: boolean;
}) {
  const { project, phone, configure, refresh } = useSetup();
  const t = useTranslations('admin.projects.setup');
  const tz = useTranslations('admin.projects.wizard');
  const tr = useTranslations('admin.projects.setup.role');
  const locale = useLocale() as Locale;
  const [person, setPerson] = useState<PanelUser | null>(null);
  const [roleKey, setRoleKey] = useState<string | null>(null);
  const [areaId, setAreaId] = useState<string | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [canDelete, setCanDelete] = useState(false);
  const [ending, setEnding] = useState<StaffAccess | null>(null);
  const can = manage && !phone && editableIn(project.status, 'staff');
  // the areas of the project, once each (a district split among RPMs is listed once)
  const places = [...new Map(areas.map((a) => [a.locationId, a])).values()];
  const placeName = (locationId: string | null) => {
    const area = places.find((a) => a.locationId === locationId);
    return area ? localized(area.locationName, locale) : t('whole_project');
  };

  const add = useMutation({
    mutationFn: () =>
      addStaff(project.id, {
        userId: person!.id,
        roleKey: roleKey as (typeof STAFF_ACCESS_ROLES)[number],
        ...(areaId ? { areaLocationId: areaId } : {}),
        canView: true,
        canEdit,
        canDelete,
      }),
    onSuccess: () => {
      setPerson(null);
      setRoleKey(null);
      setAreaId(null);
      setCanEdit(false);
      setCanDelete(false);
      refresh();
    },
  });

  // an access filled in but not given yet is given when the wizard moves on; half of one stays
  const problem = useStepSave({
    changed: can && Boolean(person || roleKey || areaId),
    invalid: person && roleKey && (configure || areaId) ? undefined : tz('staff_incomplete'),
    save: () => add.mutateAsync(),
  });

  return (
    <SetupSection id="staff" title={t('section.staff')}>
      {staff.length === 0 ? (
        <p className="admin-muted">{t('no_staff')}</p>
      ) : (
        <ul className="admin-setup-list">
          {staff.map((s) => (
            <li key={s.id}>
              <span>
                <strong>{s.displayName}</strong> ·{' '}
                {tr(s.roleKey as (typeof STAFF_ACCESS_ROLES)[number])} ·{' '}
                {placeName(s.areaLocationId)} ·{' '}
                {[
                  s.canView && t('access.view'),
                  s.canEdit && t('access.edit'),
                  s.canDelete && t('access.delete'),
                ]
                  .filter(Boolean)
                  .join(', ')}
              </span>
              {manage && !phone && (
                <Button
                  variant="ghost"
                  size="sm"
                  icon={UserMinus}
                  iconOnly
                  onPress={() => setEnding(s)}
                >
                  {t('end_access', { name: s.displayName })}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {can && (
        <>
          <h3 className="admin-setup-subtitle">{t('add_staff')}</h3>
          <div className="admin-setup-grid">
            <Select
              label={t('staff_role')}
              value={roleKey}
              onChange={(role) => {
                // the person is looked up among the holders of the role
                setRoleKey(role);
                setPerson(null);
              }}
              searchable={false}
              options={STAFF_ACCESS_ROLES.map((r) => ({ id: r, label: tr(r) }))}
            />
            {roleKey && (
              <UserSearch
                // a new role starts a new search, without the text of the last one
                key={roleKey}
                label={t('person')}
                selected={person}
                onSelect={setPerson}
                search={{
                  key: `${roleKey}:${project.id}`,
                  find: (q) => candidates(project.id, roleKey, q),
                }}
              />
            )}
            <Select
              label={t('staff_area')}
              helper={configure ? t('staff_area_hint') : undefined}
              value={areaId}
              onChange={setAreaId}
              searchable={false}
              options={places.map((a) => ({
                id: a.locationId,
                label: localized(a.locationName, locale),
              }))}
            />
          </div>
          <div className="admin-setup-checks">
            <Checkbox isSelected isDisabled>
              {t('access.view')}
            </Checkbox>
            <Checkbox isSelected={canEdit} onChange={setCanEdit}>
              {t('access.edit')}
            </Checkbox>
            {configure && (
              <Checkbox isSelected={canDelete} onChange={setCanDelete}>
                {t('access.delete')}
              </Checkbox>
            )}
          </div>
          {problem && (
            <Alert tone="warning" live="alert">
              {problem}
            </Alert>
          )}
          <SaveRow
            mutation={add}
            onSave={() => add.mutate()}
            disabled={!person || !roleKey || (!configure && !areaId)}
            label={t('add_staff')}
          />
        </>
      )}
      {ending && (
        <EndAccessDialog
          access={ending}
          onClose={() => setEnding(null)}
          onDone={() => {
            setEnding(null);
            refresh();
          }}
        />
      )}
    </SetupSection>
  );
}

function EndAccessDialog({
  access,
  onClose,
  onDone,
}: {
  access: StaffAccess;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useTranslations('admin.projects.setup');
  const tc = useTranslations('common.action');
  const [reason, setReason] = useState('');
  const end = useMutation({
    mutationFn: () => endStaff(access.id, reason.trim()),
    onSuccess: onDone,
  });
  return (
    <Modal
      title={t('end_access', { name: access.displayName })}
      size="sm"
      isOpen
      onClose={onClose}
      dismissible={!end.isPending}
      secondaryAction={
        <Button variant="secondary" onPress={onClose} disabled={end.isPending}>
          {tc('cancel')}
        </Button>
      }
      primaryAction={
        <Button
          variant="danger"
          onPress={() => end.mutate()}
          disabled={reason.trim().length < 3}
          loading={end.isPending}
        >
          {t('end')}
        </Button>
      }
    >
      {end.error instanceof ApiFailure && (
        <Alert tone="danger" live="alert">
          {end.error.message}
        </Alert>
      )}
      <TextArea label={t('reason')} required maxLength={1000} value={reason} onChange={setReason} />
    </Modal>
  );
}
