import { createElement, type HTMLAttributes, type ReactNode } from 'react';
import { cx } from '../../utils/cx.js';
import { Icon, type IconComponent } from '../Icon/Icon.js';

/** A step of the spacing scale: 1 is 4 px, 2 is 8 px, 3 is 12 px, 4 is 16 px, 5 is 24 px, 6 is 32 px. */
export type SpaceStep = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** The elements a layout piece can render as. */
export type LayoutElement =
  | 'div'
  | 'section'
  | 'article'
  | 'aside'
  | 'header'
  | 'footer'
  | 'nav'
  | 'ul'
  | 'ol'
  | 'li'
  | 'dl'
  | 'figure'
  | 'fieldset'
  | 'form'
  | 'label'
  | 'p'
  | 'span';

interface LayoutBaseProps extends HTMLAttributes<HTMLElement> {
  gap?: SpaceStep;
}

export interface StackProps extends LayoutBaseProps {
  as?: LayoutElement;
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
  as?: LayoutElement;
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
  /** The language of the value when it differs from the page's (an English address). */
  lang?: string;
  /** An icon before the label (a profile section). */
  icon?: IconComponent;
}

export interface DescriptionListProps {
  items: DescriptionItem[];
  /** Width of the label column from 640 px: sm 10rem, md 12rem (default), lg 14rem. */
  labelWidth?: 'sm' | 'md' | 'lg';
  /** Two label-and-value pairs side by side from 1024 px (a profile section); one by default. */
  columns?: 1 | 2;
  className?: string;
}

/**
 * Labels and their values (a record's facts): one under the other on phones, two columns from
 * 640 px, labels in bold.
 */
export function DescriptionList({
  items,
  labelWidth = 'md',
  columns = 1,
  className,
}: DescriptionListProps) {
  return (
    <dl
      className={cx(
        'ui-dl',
        `ui-dl-${labelWidth}`,
        columns === 2 ? 'ui-dl-two' : undefined,
        className,
      )}
    >
      {items.map(({ label, value, lang, icon }) => (
        // each pair in its own group, so a label and its value belong together
        <div key={label} className="ui-dl-item">
          <dt>
            {icon && <Icon icon={icon} size="sm" className="ui-dl-icon" />}
            {label}
          </dt>
          <dd lang={lang}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export interface FilterGroupProps {
  /** The group's title ("এলাকা"). */
  title: string;
  children?: ReactNode;
  className?: string;
}

/** A titled group of filter fields: one under the other on phones, two from 640 px, four from 1024 px. */
export function FilterGroup({ title, children, className }: FilterGroupProps) {
  return (
    <fieldset className={cx('ui-filter-group', className)}>
      <legend className="ui-filter-group-title">{title}</legend>
      <div className="ui-filter-grid">{children}</div>
    </fieldset>
  );
}

export interface TextProps extends HTMLAttributes<HTMLElement> {
  as?: 'p' | 'span' | 'div' | 'strong' | 'small';
  /** muted is the secondary text colour. */
  tone?: 'default' | 'muted';
  weight?: 'regular' | 'bold';
}

/** A line or paragraph of text without outer margins: the layout around it sets the spacing. */
export function Text({
  as = 'p',
  tone = 'default',
  weight,
  className,
  children,
  ...rest
}: TextProps) {
  return createElement(
    as,
    {
      ...rest,
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
