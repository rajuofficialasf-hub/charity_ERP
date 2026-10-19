'use client';

import { CircleAlert, Lock, ShieldCheck } from 'lucide-react';
import { useId } from 'react';
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

/** The ids that tie a native control to its label, helper and error. */
export interface FieldIds {
  inputId: string;
  helperId: string;
  errorId: string;
}

/** Stable ids for a field; `id` names the control when the page gives one. */
export function useFieldIds(id?: string): FieldIds {
  const auto = useId();
  const inputId = id ?? `field${auto}`;
  return { inputId, helperId: `${inputId}-helper`, errorId: `${inputId}-error` };
}

/** The attributes a native control needs to announce its helper, error and state. */
export function controlProps(
  ids: FieldIds,
  field: Pick<FieldBaseProps, 'helper' | 'error' | 'required' | 'readOnly' | 'locked' | 'disabled'>,
) {
  const describedBy = [field.helper && ids.helperId, field.error && ids.errorId]
    .filter(Boolean)
    .join(' ');
  return {
    id: ids.inputId,
    'aria-describedby': describedBy || undefined,
    'aria-invalid': field.error ? true : undefined,
    required: field.required,
    readOnly: field.readOnly || field.locked,
    disabled: field.disabled,
  };
}

/** The label row of a native control: the label names the control by its id. */
export function NativeFieldLabel({
  htmlFor,
  labelId,
  ...field
}: Pick<
  FieldBaseProps,
  'label' | 'required' | 'locked' | 'changed' | 'previousValue' | 'officialOnly'
> & {
  /** The control the label names; a group label passes `labelId` instead. */
  htmlFor?: string;
  labelId?: string;
}) {
  const { messages } = useUi();
  const content = (
    <>
      {field.label}
      {field.required && <span className="ui-field-req"> {messages.field.required}</span>}
      {field.locked && (
        <>
          <Icon icon={Lock} size="sm" className="ui-field-lock" />
          <span className="ui-sr-only"> ({messages.field.locked})</span>
        </>
      )}
    </>
  );
  return (
    <div className="ui-field-label-row">
      {htmlFor ? (
        <label className="ui-field-label" htmlFor={htmlFor} id={labelId}>
          {content}
        </label>
      ) : (
        <span className="ui-field-label" id={labelId}>
          {content}
        </span>
      )}
      {field.officialOnly && (
        <span className="ui-field-official">
          <Icon icon={ShieldCheck} size="sm" />
          {messages.field.officialOnly}
        </span>
      )}
      {field.changed && (
        <span className="ui-field-changed" title={field.previousValue}>
          {messages.field.changed}
          {field.previousValue !== undefined && (
            <span className="ui-sr-only">
              , {fill(messages.field.previousValue, { value: field.previousValue })}
            </span>
          )}
        </span>
      )}
    </div>
  );
}

/** Helper, error and the "request correction" link of a native control. */
export function NativeFieldFooter({
  ids,
  helper,
  error,
  locked,
  onRequestCorrection,
}: Pick<FieldBaseProps, 'helper' | 'error' | 'locked' | 'onRequestCorrection'> & {
  ids: FieldIds;
}) {
  const { messages } = useUi();
  return (
    <>
      {helper && (
        <div id={ids.helperId} className="ui-field-helper">
          {helper}
        </div>
      )}
      {error && (
        <div id={ids.errorId} className="ui-field-error">
          <Icon icon={CircleAlert} size="sm" />
          <span>{error}</span>
        </div>
      )}
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
