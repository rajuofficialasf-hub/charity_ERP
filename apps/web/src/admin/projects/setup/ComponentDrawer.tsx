import { type ComponentKey, photoRule, photoSource } from '@css/shared';
import { Alert, Button, Checkbox, Modal, RadioGroup, Select, Switch, TextField } from '@css/ui';
import { useMutation } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { ApiFailure } from '../../../lib/api';
import { type ProjectComponent, updateComponent } from './setup-api';
import { useSetup } from './setup-context';

type Settings = Record<string, unknown>;
interface Item {
  code: string;
  label: { bn: string; en: string };
  active?: boolean;
}
interface Stage {
  key: string;
  label: { bn: string; en: string };
  photo_required?: boolean;
}

type ListKey =
  | 'beneficiary_class_options'
  | 'application_kinds'
  | 'criteria'
  | 'issue_types'
  | 'categories'
  | 'questions';
type FlagKey =
  'enabled' | 'team_members_allowed' | 'family_attendance' | 'gender_split' | 'dedup_identical';

/** The code-and-label lists of each component and their maximum length (the settings schemas). */
const LISTS: Partial<Record<ComponentKey, { key: ListKey; max: number; active?: boolean }[]>> = {
  application_form: [
    { key: 'beneficiary_class_options', max: 30, active: true },
    { key: 'application_kinds', max: 20, active: true },
  ],
  rating_criteria: [{ key: 'criteria', max: 5 }],
  issue_log: [{ key: 'issue_types', max: 50, active: true }],
  volunteer_expenses: [{ key: 'categories', max: 50, active: true }],
  follow_up: [{ key: 'questions', max: 50, active: true }],
};
/** On and off settings of each component. */
const FLAGS: Partial<Record<ComponentKey, FlagKey[]>> = {
  volunteer_assignment: ['team_members_allowed'],
  dawah: ['family_attendance', 'gender_split'],
  distribution: ['dedup_identical'],
};
const PHOTO_KINDS = [
  'distribution_proof',
  'construction_proof',
  'evidence',
  'voucher',
  'payment_copy',
] as const;
const MAX_STAGES = 30;

/** A new code that no entry of the list has yet (codes and stage keys are snake case). */
const freshCode = (taken: string[], prefix: string) => {
  let n = taken.length + 1;
  while (taken.includes(`${prefix}_${n}`)) n += 1;
  return `${prefix}_${n}`;
};
const asItems = (value: unknown): Item[] => (Array.isArray(value) ? (value as Item[]) : []);
const get = (settings: Settings, key: string) =>
  Object.hasOwn(settings, key) ? Object.getOwnPropertyDescriptor(settings, key)?.value : undefined;

/**
 * The settings of one component in a dialog, with fields per its settings schema: the photo rule
 * and photo sources, lists of codes with labels (rating criteria up to five, beneficiary types,
 * application kinds, issue types, expense categories, follow-up questions), the stages in their
 * order, and on-off settings. The server checks the settings against the schema; its field errors
 * show here.
 */
export function ComponentDrawer({
  component,
  readOnly,
  onClose,
  onSaved,
}: {
  component: ProjectComponent;
  readOnly: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { project } = useSetup();
  const t = useTranslations('admin.projects.setup.drawer');
  const tk = useTranslations('admin.projects.component');
  const tc = useTranslations('common.action');
  const key = component.componentKey as ComponentKey;
  const [settings, setSettings] = useState<Settings>({ ...(component.settings ?? {}) });
  const set = (name: string, value: unknown) => setSettings({ ...settings, [name]: value });
  const save = useMutation({
    mutationFn: () => updateComponent(project.id, key, component.etag ?? '', { settings }),
    onSuccess: onSaved,
  });
  const error = save.error;

  return (
    <Modal
      title={t('title', { name: tk(key) })}
      size="lg"
      fullOnPhone
      isOpen
      onClose={onClose}
      dismissible={!save.isPending}
      secondaryAction={
        <Button variant="secondary" onPress={onClose} disabled={save.isPending}>
          {tc(readOnly ? 'close' : 'cancel')}
        </Button>
      }
      primaryAction={
        readOnly ? undefined : (
          <Button onPress={() => save.mutate()} loading={save.isPending}>
            {tc('save')}
          </Button>
        )
      }
    >
      {error instanceof ApiFailure && (
        <Alert tone={error.status === 412 ? 'warning' : 'danger'} live="alert">
          {error.status === 412 ? t('stale') : error.message}
          {error.details.length > 0 && (
            <ul>
              {error.details.map((d) => (
                <li key={d.path}>{t('field_error', { field: d.path ?? '' })}</li>
              ))}
            </ul>
          )}
        </Alert>
      )}
      {key === 'distribution' && (
        <PhotoRule settings={settings} onChange={setSettings} readOnly={readOnly} />
      )}
      {key === 'stages' && (
        <Stages
          items={Array.isArray(get(settings, 'list')) ? (get(settings, 'list') as Stage[]) : []}
          onChange={(items) => set('list', items)}
          readOnly={readOnly}
        />
      )}
      {/* eslint-disable-next-line security/detect-object-injection -- a ComponentKey of a constant table */}
      {(LISTS[key] ?? []).map((list) => (
        <CodeLabelList
          key={list.key}
          name={list.key}
          max={list.max}
          withActive={list.active === true}
          items={asItems(get(settings, list.key))}
          onChange={(items) => set(list.key, items)}
          readOnly={readOnly}
        />
      ))}
      {/* eslint-disable-next-line security/detect-object-injection -- a ComponentKey of a constant table */}
      {(FLAGS[key] ?? []).map((flag) => (
        <Switch
          key={flag}
          isSelected={get(settings, flag) === true}
          onChange={(on) => set(flag, on)}
          isDisabled={readOnly}
        >
          {t(`flag.${flag}`)}
        </Switch>
      ))}
    </Modal>
  );
}

function PhotoRule({
  settings,
  onChange,
  readOnly,
}: {
  settings: Settings;
  onChange: (next: Settings) => void;
  readOnly: boolean;
}) {
  const t = useTranslations('admin.projects.setup.drawer');
  const sources = (get(settings, 'source') ?? {}) as Settings;
  return (
    <>
      <RadioGroup
        label={t('photo_rule')}
        required
        value={(get(settings, 'rule') as string | undefined) ?? null}
        onChange={(rule) => onChange({ ...settings, rule })}
        options={photoRule.options.map((r) => ({ id: r, label: t(`rule.${r}`) }))}
        readOnly={readOnly}
      />
      <div className="admin-setup-grid">
        {PHOTO_KINDS.map((kind) => (
          <Select
            key={kind}
            label={t(`photo_kind.${kind}`)}
            value={(get(sources, kind) as string | undefined) ?? null}
            onChange={(id) =>
              onChange({ ...settings, source: { ...sources, [kind]: id ?? undefined } })
            }
            disabled={readOnly}
            searchable={false}
            options={photoSource.options.map((s) => ({ id: s, label: t(`source.${s}`) }))}
          />
        ))}
      </div>
    </>
  );
}

/** A list of codes with labels in both languages; a new item gets a fresh code. */
function CodeLabelList({
  name,
  max,
  withActive,
  items,
  onChange,
  readOnly,
}: {
  name: ListKey;
  max: number;
  withActive: boolean;
  items: Item[];
  onChange: (items: Item[]) => void;
  readOnly: boolean;
}) {
  const t = useTranslations('admin.projects.setup.drawer');
  const setItem = (i: number, patch: Partial<Item>) =>
    onChange(items.map((item, j) => (j === i ? { ...item, ...patch } : item)));
  return (
    <fieldset className="admin-setup-fieldset">
      <legend>{t(`list.${name}`)}</legend>
      {items.map((item, i) => (
        <div key={item.code} className="admin-setup-row">
          <TextField
            label={t('label_bn', { number: String(i + 1) })}
            maxLength={200}
            value={item.label.bn}
            onChange={(bn) => setItem(i, { label: { ...item.label, bn } })}
            readOnly={readOnly}
          />
          <TextField
            label={t('label_en', { number: String(i + 1) })}
            maxLength={200}
            lang="en"
            value={item.label.en}
            onChange={(en) => setItem(i, { label: { ...item.label, en } })}
            readOnly={readOnly}
          />
          {withActive && (
            <Checkbox
              isSelected={item.active !== false}
              onChange={(active) => setItem(i, { active })}
              isDisabled={readOnly}
            >
              {t('in_use')}
            </Checkbox>
          )}
          {!readOnly && (
            <Button
              variant="ghost"
              size="sm"
              icon={Trash2}
              iconOnly
              onPress={() => onChange(items.filter((_, j) => j !== i))}
            >
              {t('remove', { number: String(i + 1) })}
            </Button>
          )}
        </div>
      ))}
      {!readOnly && (
        <Button
          variant="ghost"
          size="sm"
          icon={Plus}
          disabled={items.length >= max}
          onPress={() =>
            onChange([
              ...items,
              {
                code: freshCode(
                  items.map((i) => i.code),
                  'item',
                ),
                label: { bn: '', en: '' },
              },
            ])
          }
        >
          {t('add', { max: String(max) })}
        </Button>
      )}
    </fieldset>
  );
}

/** The stages in their order, each with a photo requirement. */
function Stages({
  items,
  onChange,
  readOnly,
}: {
  items: Stage[];
  onChange: (items: Stage[]) => void;
  readOnly: boolean;
}) {
  const t = useTranslations('admin.projects.setup.drawer');
  const move = (i: number, by: number) => {
    const next = [...items];
    const [item] = next.splice(i, 1);
    next.splice(i + by, 0, item!);
    onChange(next);
  };
  const setItem = (i: number, patch: Partial<Stage>) =>
    onChange(items.map((item, j) => (j === i ? { ...item, ...patch } : item)));
  return (
    <fieldset className="admin-setup-fieldset">
      <legend>{t('list.stages')}</legend>
      {items.map((item, i) => (
        <div key={item.key} className="admin-setup-row">
          <TextField
            label={t('label_bn', { number: String(i + 1) })}
            maxLength={200}
            value={item.label.bn}
            onChange={(bn) => setItem(i, { label: { ...item.label, bn } })}
            readOnly={readOnly}
          />
          <TextField
            label={t('label_en', { number: String(i + 1) })}
            maxLength={200}
            lang="en"
            value={item.label.en}
            onChange={(en) => setItem(i, { label: { ...item.label, en } })}
            readOnly={readOnly}
          />
          <Checkbox
            isSelected={item.photo_required === true}
            onChange={(photo_required) => setItem(i, { photo_required })}
            isDisabled={readOnly}
          >
            {t('photo_required')}
          </Checkbox>
          {!readOnly && (
            <span className="admin-setup-order">
              <Button
                variant="ghost"
                size="sm"
                icon={ArrowUp}
                iconOnly
                disabled={i === 0}
                onPress={() => move(i, -1)}
              >
                {t('up', { number: String(i + 1) })}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                icon={ArrowDown}
                iconOnly
                disabled={i === items.length - 1}
                onPress={() => move(i, 1)}
              >
                {t('down', { number: String(i + 1) })}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                icon={Trash2}
                iconOnly
                onPress={() => onChange(items.filter((_, j) => j !== i))}
              >
                {t('remove', { number: String(i + 1) })}
              </Button>
            </span>
          )}
        </div>
      ))}
      {!readOnly && (
        <Button
          variant="ghost"
          size="sm"
          icon={Plus}
          disabled={items.length >= MAX_STAGES}
          onPress={() =>
            onChange([
              ...items,
              {
                key: freshCode(
                  items.map((i) => i.key),
                  'stage',
                ),
                label: { bn: '', en: '' },
              },
            ])
          }
        >
          {t('add', { max: String(MAX_STAGES) })}
        </Button>
      )}
    </fieldset>
  );
}
