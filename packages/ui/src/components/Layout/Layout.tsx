import { createElement, type AriaRole, type ReactNode } from 'react';
import { cx } from '../../utils/cx.js';

/** A step of the spacing scale: 1 is 4 px, 2 is 8 px, 3 is 12 px, 4 is 16 px, 5 is 24 px, 6 is 32 px. */
export type SpaceStep = 0 | 1 | 2 | 3 | 4 | 5 | 6;

interface LayoutBaseProps {
  gap?: SpaceStep;
  className?: string;
  children?: ReactNode;
  id?: string;
  role?: AriaRole;
  'aria-label'?: string;
  'aria-labelledby'?: string;
}

export interface StackProps extends LayoutBaseProps {
  as?: 'div' | 'section' | 'header' | 'footer' | 'nav' | 'ul' | 'ol' | 'li' | 'p' | 'span';
  /** column (default) stacks the children; row puts them side by side. */
  direction?: 'column' | 'row';
  /** A row wraps onto further lines when it runs out of room. */
  wrap?: boolean;
  align?: 'start' | 'center' | 'end' | 'baseline' | 'stretch';
  justify?: 'start' | 'center' | 'end' | 'between';
}

/** Children in a column or a row, spaced by a step of the spacing scale. */
export function Stack({
  as = 'div',
  direction = 'column',
  gap = 0,
  wrap = false,
  align,
  justify,
  className,
  children,
  ...rest
}: StackProps) {
  return createElement(
    as,
    {
      ...rest,
      className: cx(
        'ui-stack',
        direction === 'row' && 'ui-stack-row',
        wrap && 'ui-stack-wrap',
        gap > 0 && `ui-gap-${gap}`,
        align && `ui-align-${align}`,
        justify && `ui-justify-${justify}`,
        className,
      ),
    },
    children,
  );
}

export interface GridProps extends LayoutBaseProps {
  as?: 'div' | 'section' | 'ul' | 'ol' | 'dl';
  /** Equal columns; one column, the default, stacks the children. */
  columns?: 1 | 2 | 3 | 4 | 5;
}

/** Children on a grid of equal columns, spaced by a step of the spacing scale. */
export function Grid({ as = 'div', columns, gap = 0, className, children, ...rest }: GridProps) {
  return createElement(
    as,
    {
      ...rest,
      className: cx(
        'ui-grid',
        columns && columns > 1 && `ui-grid-${columns}`,
        gap > 0 && `ui-gap-${gap}`,
        className,
      ),
    },
    children,
  );
}

export interface DescriptionItem {
  label: string;
  value: ReactNode;
}

export interface DescriptionListProps {
  items: DescriptionItem[];
  /** Width of the label column from 640 px: sm 10rem, md 12rem (default), lg 14rem. */
  labelWidth?: 'sm' | 'md' | 'lg';
  className?: string;
}

/**
 * Labels and their values (a record's facts): one under the other on phones, two columns from
 * 640 px, labels in bold.
 */
export function DescriptionList({ items, labelWidth = 'md', className }: DescriptionListProps) {
  return (
    <dl className={cx('ui-dl', `ui-dl-${labelWidth}`, className)}>
      {items.map(({ label, value }) => (
        <div key={label} className="ui-dl-item">
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export interface TextProps {
  as?: 'p' | 'span' | 'div';
  /** muted is the secondary text colour. */
  tone?: 'default' | 'muted';
  weight?: 'regular' | 'bold';
  className?: string;
  children?: ReactNode;
  id?: string;
}

/** A line or paragraph of text without outer margins: the layout around it sets the spacing. */
export function Text({ as = 'p', tone = 'default', weight, className, children, id }: TextProps) {
  return createElement(
    as,
    {
      id,
      className: cx(
        'ui-text',
        tone === 'muted' && 'ui-text-muted',
        weight === 'bold' && 'ui-text-bold',
        className,
      ),
    },
    children,
  );
}
