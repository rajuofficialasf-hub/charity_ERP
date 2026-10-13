import type { ReactNode } from 'react';
import { cx } from '../../utils/cx.js';

export interface PageBandProps {
  /** The page title; rendered as the page's h1. */
  title: string;
  /** At most one short line under the title (UX-17). */
  subtitle?: string;
  /** Controls in the band, for example a segmented choice. */
  children?: ReactNode;
  className?: string;
}

/**
 * The green title band of a public page (UX-16), the head of a card: the title and one short line
 * in white on the dark brand green, which keeps 4.5:1 for small text (colors.md).
 */
export function PageBand({ title, subtitle, children, className }: PageBandProps) {
  return (
    <header className={cx('ui-page-band', className)}>
      <h1 className="ui-page-band-title">{title}</h1>
      {subtitle && <p className="ui-page-band-subtitle">{subtitle}</p>}
      {children}
    </header>
  );
}
