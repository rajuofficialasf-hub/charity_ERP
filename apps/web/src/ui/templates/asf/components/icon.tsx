import type { ExtendedIconProps } from '@/ui/contract';

import { iconBodies } from './icon-data';

// ----------------------------------------------------------------------

/** A Solar duotone icon in the current text colour. Decorative unless `label` is given. */
export function Icon({ name, label, size = 24 }: ExtendedIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      focusable="false"
      style={{ flexShrink: 0, display: 'inline-block', verticalAlign: 'middle' }}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
      // The bodies are fixed SVG from the generated icon-data.ts, never user input.
      dangerouslySetInnerHTML={{ __html: iconBodies[name] }}
    />
  );
}
