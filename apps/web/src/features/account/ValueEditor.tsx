import { TextField } from '@css/ui';
import { useTranslations } from 'use-intl';
import { type Address, AddressFields, EMPTY_ADDRESS } from '../registration/AddressFields';
import type { RequestField } from './profile-api';

type Bank = Record<
  'bankName' | 'accountName' | 'accountNumber' | 'branchName' | 'routingNumber',
  string
>;
const BANK_LABEL = {
  bankName: 'form.bank_name',
  accountName: 'form.account_name',
  accountNumber: 'form.account_number',
  branchName: 'form.branch_name',
  routingNumber: 'form.routing_number',
} as const;
const NUMERIC = new Set<RequestField>(['nid', 'whatsapp', 'mobile']);

/**
 * The input for the new value of one field (DECISION_LOG D-085): a text, the address cascade or the bank
 * details; photos are uploaded by their own field. The value is what the API expects as
 * `newValue`.
 */
export function ValueEditor({
  field,
  label,
  value,
  onChange,
  error,
}: {
  field: RequestField;
  label: string;
  value: unknown;
  onChange: (value: unknown) => void;
  error?: string;
}) {
  const t = useTranslations('registration');
  if (field === 'address')
    return (
      <AddressFields
        value={(value as Address | undefined) ?? EMPTY_ADDRESS}
        onChange={onChange}
        errors={{ divisionId: error }}
      />
    );
  if (field === 'bank') {
    const bank = (value as Partial<Bank> | undefined) ?? {};
    return (
      <>
        {(Object.keys(BANK_LABEL) as (keyof Bank)[]).map((key) => (
          <TextField
            key={key}
            label={t(BANK_LABEL[key])}
            name={key}
            value={bank[key] ?? ''}
            onChange={(v) => onChange({ ...bank, [key]: v })}
            error={key === 'bankName' ? error : undefined}
          />
        ))}
      </>
    );
  }
  return (
    <TextField
      label={label}
      name={`value-${field}`}
      type={field === 'email' ? 'email' : 'text'}
      inputMode={NUMERIC.has(field) ? 'numeric' : undefined}
      value={typeof value === 'string' ? value : ''}
      onChange={onChange}
      required
      error={error}
    />
  );
}

/** Drops empty bank fields: the API keeps only what is given. */
export function cleanValue(field: RequestField, value: unknown): unknown {
  if (field !== 'bank' || !value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, string>).filter(([, v]) => v.trim() !== ''),
  );
}
