'use client';

import { CircleAlert, Lock, ShieldCheck } from 'lucide-react';
import { FieldError, Label, Text } from 'react-aria-components';
import { fill } from '../../provider/messages.js';
import { useUi } from '../../provider/UiProvider.js';
import { Button } from '../Button/Button.js';
import { Icon } from '../Icon/Icon.js';

/** Props shared by every Field control (DESIGN_SYSTEM 5.4). */
export interface FieldBaseProps {
  /** Always visible; never replaced by a placeholder. */
  label: string;
  helper?: string;
  /** Error message; sets aria-invalid and is linked with aria-describedby. */
  error?: string;
  /** States "required" in text, not only with an asterisk. */
  required?: boolean;
  /** Read-only with a lock icon (BD-02, BD-18); the value stays readable and copyable. */
  locked?: boolean;
  /** Shows the "request correction" link of a locked field. */
  onRequestCorrection?: () => void;
  readOnly?: boolean;
  disabled?: boolean;
  /** Change-log marker with the previous value (field unlock history). */
  changed?: boolean;
  previousValue?: string;
  /** Tag for fields that render only for officials; the server never sends them to volunteers. */
  officialOnly?: boolean;
  name?: string;
  id?: string;
  /** Layout only. */
  className?: string;
}

export function FieldLabel({
  label,
  required,
  locked,
  changed,
  previousValue,
  officialOnly,
  elementType,
}: Pick<
  FieldBaseProps,
  'label' | 'required' | 'locked' | 'changed' | 'previousValue' | 'officialOnly'
> & {
  elementType?: 'label' | 'span';
}) {
  const { messages } = useUi();
  return (
    <div className="ui-field-label-row">
      <Label className="ui-field-label" elementType={elementType}>
        {label}
        {required && <span className="ui-field-req"> {messages.field.required}</span>}
        {locked && (
          <>
            <Icon icon={Lock} size="sm" className="ui-field-lock" />
            <span className="ui-sr-only"> ({messages.field.locked})</span>
          </>
        )}
      </Label>
      {officialOnly && (
        <span className="ui-field-official">
          <Icon icon={ShieldCheck} size="sm" />
          {messages.field.officialOnly}
        </span>
      )}
      {changed && (
        <span className="ui-field-changed" title={previousValue}>
          {messages.field.changed}
          {previousValue !== undefined && (
            <span className="ui-sr-only">
              , {fill(messages.field.previousValue, { value: previousValue })}
            </span>
          )}
        </span>
      )}
    </div>
  );
}

export function FieldFooter({
  helper,
  error,
  locked,
  onRequestCorrection,
}: Pick<FieldBaseProps, 'helper' | 'error' | 'locked' | 'onRequestCorrection'>) {
  const { messages } = useUi();
  return (
    <>
      {helper && (
        <Text slot="description" className="ui-field-helper">
          {helper}
        </Text>
      )}
      <FieldError className="ui-field-error">
        <Icon icon={CircleAlert} size="sm" />
        <span>{error}</span>
      </FieldError>
      {locked && onRequestCorrection && (
        <Button
          variant="ghost"
          size="sm"
          className="ui-field-correction"
          onPress={onRequestCorrection}
        >
          {messages.field.requestCorrection}
        </Button>
      )}
    </>
  );
}

/** Class names of the field wrapper for its states. */
export function fieldClass(props: Pick<FieldBaseProps, 'error' | 'locked' | 'className'>): string {
  return ['ui-field', props.error && 'has-error', props.locked && 'is-locked', props.className]
    .filter(Boolean)
    .join(' ');
}
