import { useState } from 'react';

/**
 * Text value that may be controlled or uncontrolled, passed through a transform (for example
 * Bengali-to-English digits) before it is shown and reported.
 */
export function useTextValue(
  value: string | undefined,
  defaultValue: string | undefined,
  onChange: ((value: string) => void) | undefined,
  transform: (raw: string) => string = (raw) => raw,
): [string, (raw: string) => void] {
  const [inner, setInner] = useState(() => transform(defaultValue ?? ''));
  const current = value ?? inner;
  const set = (raw: string) => {
    const next = transform(raw);
    setInner(next);
    onChange?.(next);
  };
  return [current, set];
}
