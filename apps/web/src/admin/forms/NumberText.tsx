import { NumberField } from '@css/ui';
import { useState } from 'react';

/**
 * A number of the builder's settings (a limit, a condition's value, a term of a calculation),
 * typed as text: a half-typed number such as "12." stays on screen while it means the stored
 * value, and an empty field means no number.
 */
export function NumberText({
  label,
  value,
  onChange,
  integer = false,
  error,
}: {
  label: string;
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  integer?: boolean;
  error?: string;
}) {
  const stored = value === undefined ? '' : String(value);
  const [typed, setTyped] = useState(stored);
  const [seen, setSeen] = useState(stored);
  if (stored !== seen) {
    setSeen(stored);
    if (stored === '' || Number(typed) !== Number(stored)) setTyped(stored);
  }
  return (
    <NumberField
      label={label}
      kind={integer ? 'integer' : 'decimal'}
      value={typed}
      error={error}
      onChange={(text) => {
        setTyped(text);
        const clean = text.trim();
        const n = Number(clean);
        if (clean === '') onChange(undefined);
        else if (Number.isFinite(n)) onChange(n);
      }}
    />
  );
}
