'use client';

import { useId, type ReactNode } from 'react';
import { ChevronRight, Lock } from 'lucide-react';
import { Link as AriaLink, Switch as AriaSwitch } from 'react-aria-components';
import { cx } from '../../utils/cx.js';
import { Icon } from '../Icon/Icon.js';

export interface SwitchProps {
  /** The visible label, or `aria-label` when the label is elsewhere. */
  children?: ReactNode;
  'aria-label'?: string;
  'aria-describedby'?: string;
  isSelected?: boolean;
  defaultSelected?: boolean;
  onChange?: (selected: boolean) => void;
  isDisabled?: boolean;
  className?: string;
}

/** Switch with role switch; a check or cross glyph in the thumb so the state is not colour alone. */
export function Switch({ children, className, ...props }: SwitchProps) {
  return (
    <AriaSwitch {...props} className={cx('ui-switch', className)}>
      {children && <span className="ui-switch-label">{children}</span>}
      <span className="ui-switch-track" aria-hidden="true">
        <span className="ui-switch-thumb">
          <svg viewBox="0 0 24 24" className="ui-switch-on">
            <path d="M5 12l5 5 9-10" />
          </svg>
          <svg viewBox="0 0 24 24" className="ui-switch-off">
            <path d="M8 8l8 8M16 8l-8 8" />
          </svg>
        </span>
      </span>
    </AriaSwitch>
  );
}

interface RowBase {
  title: string;
  description?: string;
  className?: string;
}

export type RowToggleProps = RowBase &
  (
    | {
        control: 'switch';
        checked?: boolean;
        defaultChecked?: boolean;
        onChange?: (checked: boolean) => void;
        disabled?: boolean;
        /** Why a toggle cannot change, for example a component that cannot be turned off after activation. */
        lockedReason?: string;
      }
    | { control: 'chevron'; href: string }
    | { control: 'value'; value: ReactNode }
    | { control: 'none' }
  );

/** Settings or list row with a trailing control (DESIGN_SYSTEM 5.6); the whole row is the label. */
export function RowToggle(props: RowToggleProps) {
  const { title, description, className } = props;
  const reasonId = useId();
  const text = (
    <span className="ui-row-text">
      <span className="ui-row-title">{title}</span>
      {description && <span className="ui-row-desc">{description}</span>}
    </span>
  );
  if (props.control === 'switch') {
    const locked = !!props.lockedReason;
    return (
      <div className={cx('ui-row', className)}>
        <AriaSwitch
          className="ui-row-switch"
          isSelected={props.checked}
          defaultSelected={props.defaultChecked}
          onChange={props.onChange}
          isDisabled={props.disabled || locked}
          aria-describedby={locked ? reasonId : undefined}
        >
          {text}
          <span className="ui-switch-track" aria-hidden="true">
            <span className="ui-switch-thumb">
              <svg viewBox="0 0 24 24" className="ui-switch-on">
                <path d="M5 12l5 5 9-10" />
              </svg>
              <svg viewBox="0 0 24 24" className="ui-switch-off">
                <path d="M8 8l8 8M16 8l-8 8" />
              </svg>
            </span>
          </span>
        </AriaSwitch>
        {locked && (
          <p className="ui-row-locked" id={reasonId}>
            <Icon icon={Lock} size="sm" />
            {props.lockedReason}
          </p>
        )}
      </div>
    );
  }
  if (props.control === 'chevron') {
    return (
      <AriaLink href={props.href} className={cx('ui-row', 'ui-row-link', className)}>
        {text}
        <Icon icon={ChevronRight} />
      </AriaLink>
    );
  }
  return (
    <div className={cx('ui-row', className)}>
      {text}
      {props.control === 'value' && <span className="ui-row-value">{props.value}</span>}
    </div>
  );
}
