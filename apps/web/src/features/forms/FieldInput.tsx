import type { AnswerValue } from '@css/shared';
import type { ComputedValue, FieldState, FormField } from '@css/shared/forms';
import { formatCount } from '@css/shared/format';
import {
  CheckboxGroup,
  DateField,
  NumberField,
  PhoneField,
  RadioGroup,
  Select,
  Stack,
  Text,
  TextArea,
  TextField,
} from '@css/ui';
import { useState } from 'react';
import { useLocale, useTranslations } from 'use-intl';
import { type Address, AddressFields, EMPTY_ADDRESS } from '../registration/AddressFields';
import { GpsField } from './GpsField';
import type { FieldUpload } from './upload-adapter';
import { UploadField } from './UploadField';

export interface FieldInputProps {
  field: FormField;
  /** The id the field's input carries, for the error summary's links. */
  id: string;
  state: FieldState;
  value: AnswerValue | undefined;
  computed: ComputedValue | undefined;
  error?: string;
  onChange: (value: AnswerValue | null) => void;
  upload?: FieldUpload;
  /** Told while a file of this question is still going up. */
  onUploading?: (busy: boolean) => void;
  /** Nisab comparisons show no value where the nisab is not known (the public page). */
  nisabKnown: boolean;
}

const choice = (value: AnswerValue | undefined) =>
  value && 'v' in value && typeof value.v === 'string' ? value.v : null;
const text = (value: AnswerValue | undefined) => choice(value) ?? '';
const choices = (value: AnswerValue | undefined) =>
  value && 'v' in value && Array.isArray(value.v) ? (value.v as string[]) : [];
const other = (value: AnswerValue | undefined) =>
  value && 'other' in value && typeof value.other === 'string' ? value.other : '';

/** One question of a form, drawn with the component of its type. */
export function FieldInput({
  field,
  id,
  state,
  value,
  computed,
  error,
  onChange,
  upload,
  onUploading,
  nisabKnown,
}: FieldInputProps) {
  const t = useTranslations('forms.renderer');
  const locale = useLocale();
  const label = field.label[locale];
  const help = field.settings?.help?.[locale];
  const common = { label, name: id, required: state.required, error, helper: help };
  const options = state.options.map((o) => ({ id: o.code, label: o.label[locale] }));
  const otherId = state.options.find((o) => o.allowsOtherText)?.code;
  const otherProps = otherId
    ? {
        otherOptionId: otherId,
        otherValue: other(value),
      }
    : {};
  const setText = (t: 'short_text' | 'long_text' | 'phone' | 'email') => (v: string) =>
    onChange(v.trim() === '' ? null : { t, v });

  switch (field.type) {
    case 'note':
      return (
        <Stack gap={1}>
          <Text weight="bold">{label}</Text>
          {help ? <Text tone="muted">{help}</Text> : null}
        </Stack>
      );
    case 'short_text':
      return <TextField {...common} value={text(value)} onChange={setText('short_text')} />;
    case 'email':
      return <TextField {...common} type="email" value={text(value)} onChange={setText('email')} />;
    case 'long_text':
      return <TextArea {...common} value={text(value)} onChange={setText('long_text')} />;
    case 'phone':
      return <PhoneField {...common} value={text(value)} onChange={setText('phone')} />;
    case 'number':
    case 'decimal':
    case 'money':
      return <NumberInput {...common} type={field.type} value={value} onChange={onChange} />;
    case 'date':
      return (
        <DateField
          {...common}
          value={text(value) || null}
          onChange={(iso) => onChange(iso ? { t: 'date', v: iso } : null)}
        />
      );
    case 'time':
      return (
        <TextField
          {...common}
          helper={help ?? t('time_helper')}
          inputMode="numeric"
          value={text(value)}
          onChange={(v) => onChange(v.trim() ? { t: 'time', v: v.trim() } : null)}
        />
      );
    case 'datetime':
      return <DateTimeInput {...common} value={value} onChange={onChange} />;
    case 'single_select':
    case 'radio': {
      const t2 = field.type;
      const onPick = (code: string | null) =>
        onChange(
          code
            ? {
                t: t2,
                v: code,
                ...(code === otherId && other(value) ? { other: other(value) } : {}),
              }
            : null,
        );
      const onOther = (text: string) =>
        choice(value)
          ? onChange({ t: t2, v: choice(value)!, ...(text ? { other: text } : {}) })
          : undefined;
      return t2 === 'radio' ? (
        <RadioGroup
          {...common}
          {...otherProps}
          onOtherChange={onOther}
          options={options}
          value={choice(value)}
          onChange={onPick}
        />
      ) : (
        <Select
          {...common}
          {...otherProps}
          onOtherChange={onOther}
          options={options}
          value={choice(value)}
          onChange={onPick}
        />
      );
    }
    case 'multi_select':
    case 'checkbox': {
      const t2 = field.type;
      return (
        <CheckboxGroup
          {...common}
          {...otherProps}
          onOtherChange={(text) =>
            choices(value).length
              ? onChange({ t: t2, v: choices(value), ...(text ? { other: text } : {}) })
              : undefined
          }
          options={options}
          value={choices(value)}
          onChange={(ids) =>
            onChange(
              ids.length
                ? { t: t2, v: ids, ...(other(value) ? { other: other(value) } : {}) }
                : null,
            )
          }
        />
      );
    }
    case 'bd_address':
      return <AddressInput value={value} error={error} onChange={onChange} />;
    case 'gps':
      return (
        <GpsField {...common} value={value?.t === 'gps' ? value : undefined} onChange={onChange} />
      );
    case 'photo':
    case 'file':
    case 'signature':
      return (
        <UploadField
          {...common}
          type={field.type}
          fieldKey={field.fieldKey}
          helper={field.type === 'signature' ? (help ?? t('signature_helper')) : help}
          fileIds={choices(value)}
          adapter={upload}
          onUploading={onUploading}
          onChange={(ids) => onChange(ids.length ? { t: field.type as 'photo', v: ids } : null)}
        />
      );
    case 'calculation':
      return (
        <TextField
          {...common}
          readOnly
          helper={
            help ??
            (computedNeedsNisab(field) && !nisabKnown ? t('office_works_out') : t('calculated'))
          }
          value={shown(computed, locale, t)}
        />
      );
    case 'repeat_group':
      return null;
  }
}

/** The calculation compares with the nisab, which the public page does not know. */
const computedNeedsNisab = (field: FormField) =>
  JSON.stringify(field.calculation?.expr ?? null).includes('nisab_value');

function shown(
  value: ComputedValue | undefined,
  locale: 'bn' | 'en',
  t: (key: 'yes' | 'no') => string,
): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'boolean') return value ? t('yes') : t('no');
  if (typeof value === 'number') return formatCount(value, locale);
  return value;
}

/**
 * The address while it is being chosen: the engine takes only a whole address, so the levels
 * chosen so far stay here until the union is picked, and the answer is set only then.
 */
function AddressInput({
  value,
  error,
  onChange,
}: {
  value: AnswerValue | undefined;
  error?: string;
  onChange: (value: AnswerValue | null) => void;
}) {
  const whole = value?.t === 'bd_address' ? value : null;
  const [draft, setDraft] = useState<Address>(() =>
    whole
      ? {
          divisionId: whole.division_id,
          districtId: whole.district_id,
          upazilaId: whole.upazila_id,
          unionId: whole.union_id,
        }
      : EMPTY_ADDRESS,
  );
  return (
    <AddressFields
      value={draft}
      errors={{ unionId: error }}
      onChange={(next) => {
        setDraft(next);
        onChange(
          next.divisionId && next.districtId && next.upazilaId && next.unionId
            ? {
                t: 'bd_address',
                division_id: next.divisionId,
                district_id: next.districtId,
                upazila_id: next.upazilaId,
                union_id: next.unionId,
              }
            : null,
        );
      }}
    />
  );
}

/** A number, a decimal or an amount, typed as text and kept as typed until it is a number. */
function NumberInput({
  type,
  value,
  onChange,
  ...common
}: {
  type: 'number' | 'decimal' | 'money';
  value: AnswerValue | undefined;
  onChange: (value: AnswerValue | null) => void;
  label: string;
  name: string;
  required: boolean;
  error?: string;
  helper?: string;
}) {
  const stored = value && 'v' in value ? String(value.v) : '';
  const [typed, setTyped] = useState(stored);
  const [seen, setSeen] = useState(stored);
  // an answer set elsewhere (a stored copy, a cleared form) shows; a half-typed number such as
  // "12." stays as typed while it means the stored value
  if (stored !== seen) {
    setSeen(stored);
    if (stored === '' || Number(typed) !== Number(stored)) setTyped(stored);
  }
  return (
    <NumberField
      {...common}
      kind={type === 'number' ? 'integer' : type === 'money' ? 'money' : 'decimal'}
      value={typed}
      onChange={(v) => {
        setTyped(v);
        const clean = v.trim();
        if (clean === '') return onChange(null);
        if (type === 'money')
          // the bounded amount pattern of the answer schema; no catastrophic backtracking
          // eslint-disable-next-line security/detect-unsafe-regex
          return /^[0-9]{1,12}(\.[0-9]{1,2})?$/.test(clean)
            ? onChange({ t: 'money', v: clean })
            : undefined;
        const n = Number(clean);
        if (Number.isFinite(n)) onChange({ t: type, v: n });
      }}
    />
  );
}

/** A date and a time, kept as one Dhaka date-time. */
function DateTimeInput({
  value,
  onChange,
  ...common
}: {
  value: AnswerValue | undefined;
  onChange: (value: AnswerValue | null) => void;
  label: string;
  name: string;
  required: boolean;
  error?: string;
  helper?: string;
}) {
  const t = useTranslations('forms.renderer');
  const current = value?.t === 'datetime' ? value.v : '';
  const [date, setDate] = useState(current.slice(0, 10));
  const [time, setTime] = useState(current.slice(11, 16));
  const send = (d: string, tm: string) =>
    onChange(
      d && /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(tm)
        ? { t: 'datetime', v: `${d}T${tm}:00+06:00` }
        : null,
    );
  return (
    <Stack gap={2}>
      <DateField
        {...common}
        value={date || null}
        onChange={(iso) => {
          setDate(iso ?? '');
          send(iso ?? '', time);
        }}
      />
      <TextField
        label={t('datetime_time', { label: common.label })}
        name={`${common.name}-time`}
        required={common.required}
        inputMode="numeric"
        helper={t('time_helper')}
        value={time}
        onChange={(v) => {
          setTime(v.trim());
          send(date, v.trim());
        }}
      />
    </Stack>
  );
}
