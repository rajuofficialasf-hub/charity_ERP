import { type ReactNode } from 'react';

const hiddenStyle = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: 0,
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0,
} as const;

export interface VisuallyHiddenProps {
  children: ReactNode;
}

/**
 * Text that screen readers announce but sighted users do not see, for icon-only controls and
 * extra context (NFR-46). The design system (T1.4) keeps this primitive.
 */
export function VisuallyHidden({ children }: VisuallyHiddenProps) {
  return <span style={hiddenStyle}>{children}</span>;
}
