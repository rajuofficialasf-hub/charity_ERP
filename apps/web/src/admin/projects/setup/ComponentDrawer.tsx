import { type ComponentKey, photoRule, photoSource } from '@css/shared';
import {
  Button,
  Checkbox,
  Dialog,
  Form,
  IconButton,
  RadioGroup,
  SelectField,
  Switch,
  TextField,
} from '@/ui';
import { useMutation } from '@tanstack/react-query';
import { useForm, useWatch } from 'react-hook-form';
import { useTranslations } from 'use-intl';
import { z } from 'zod';
import { ApiFailure } from '../../../api/client';
import { type ProjectComponent, updateComponent } from './setup-api';
import { useSetup } from './setup-context';
import { useSchemaResolver } from '../../../lib/form-schema';

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

/** The settings as one value: the server checks them against the component's settings schema. */
const DRAWER_SCHEMA = z.object({ settings: z.record(z.string(), z.unknown()) });
type DrawerFields = z.infer<typeof DRAWER_SCHEMA>;

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
  const form = useForm<DrawerFields>({
    resolver: useSchemaResolver(DRAWER_SCHEMA),
    defaultValues: { settings: { ...(component.settings ?? {}) } },
  });
  const settings = useWatch({ control: form.control, name: 'settings' });
  const setSettings = (next: Settings) => form.setValue('settings', next);
  const set = (name: string, value: unknown) => setSettings({ ...settings, [name]: value });
  const save = useMutation({
    mutationFn: (v: DrawerFields) =>
      updateComponent(project.id, key, component.etag ?? '', { settings: v.settings }),
    onSuccess: onSaved,
  });
  const submit = (v: DrawerFields) => {
    if (!readOnly) save.mutate(v);
  };
  const error = save.error instanceof ApiFailure ? save.error : undefined;
  const title = t('title', { name: tk(key) });

  return (
    <Dialog
      title={title}
      size="large"
      fullScreenOnPhone
      open
      onClose={onClose}
      dismissible={!save.isPending}
      actions={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            {tc(readOnly ? 'close' : 'cancel')}
          </Button>
          {readOnly ? null : (
            <Button onClick={() => void form.handleSubmit(submit)()} loading={save.isPending}>
              {tc('save')}
            </Button>
          )}
        </>
      }
    >
      <Form
        form={form}
        onSubmit={submit}
        label={title}
        error={error && (error.status === 412 ? t('stale') : error.message)}
      >
        {error && error.details.length > 0 && (
          <ul>
            {error.details.map((d) => (
              <li key={d.path}>{t('field_error', { field: d.path ?? '' })}</li>
            ))}
          </ul>
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
            label={t(`flag.${flag}`)}
            key={flag}
            checked={get(settings, flag) === true}
            onChange={(on) => set(flag, on)}
            disabled={readOnly}
          />
        ))}
      </Form>
    </Dialog>
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
        value={(get(settings, 'rule') as string | undefined) ?? ''}
        onChange={(rule) => onChange({ ...settings, rule })}
        options={photoRule.options.map((r) => ({ value: r, label: t(`rule.${r}`) }))}
        disabled={readOnly}
      />
      <div className="admin-setup-grid">
        {PHOTO_KINDS.map((kind) => (
          <SelectField
            key={kind}
            label={t(`photo_kind.${kind}`)}
            value={(get(sources, kind) as string | undefined) ?? ''}
            onChange={(id) =>
              onChange({ ...settings, source: { ...sources, [kind]: id || undefined } })
            }
            disabled={readOnly}
            searchable={false}
            options={photoSource.options.map((s) => ({ value: s, label: t(`source.${s}`) }))}
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
              label={t('in_use')}
              checked={item.active !== false}
              onChange={(active) => setItem(i, { active })}
              disabled={readOnly}
            />
          )}
          {!readOnly && (
            <IconButton
              label={t('remove', { number: String(i + 1) })}
              icon="delete"

              onClick={() => onChange(items.filter((_, j) => j !== i))}
            />
          )}
        </div>
      ))}
      {!readOnly && (
        <Button
          variant="text"
          size="small"
          startIcon="add"
          disabled={items.length >= max}
          onClick={() =>
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
            label={t('photo_required')}
            checked={item.photo_required === true}
            onChange={(photo_required) => setItem(i, { photo_required })}
            disabled={readOnly}
          />
          {!readOnly && (
            <span className="admin-setup-order">
              <IconButton
                label={t('up', { number: String(i + 1) })}
                icon="arrow-up"

                disabled={i === 0}
                onClick={() => move(i, -1)}
              />
              <IconButton
                label={t('down', { number: String(i + 1) })}
                icon="arrow-down"

                disabled={i === items.length - 1}
                onClick={() => move(i, 1)}
              />
              <IconButton
                label={t('remove', { number: String(i + 1) })}
                icon="delete"

                onClick={() => onChange(items.filter((_, j) => j !== i))}
              />
            </span>
          )}
        </div>
      ))}
      {!readOnly && (
        <Button
          variant="text"
          size="small"
          startIcon="add"
          disabled={items.length >= MAX_STAGES}
          onClick={() =>
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
