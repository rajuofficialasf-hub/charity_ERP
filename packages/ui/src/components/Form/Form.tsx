'use client';

import { useEffect, useRef, type FormEvent, type ReactNode } from 'react';
import { Form as AriaForm } from 'react-aria-components';
import { CircleAlert } from 'lucide-react';
import { useUi } from '../../provider/UiProvider.js';
import { cx } from '../../utils/cx.js';
import { Icon } from '../Icon/Icon.js';

export interface FormProps {
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
  /** Server validation errors by field name, shown on the fields (API_STANDARDS error envelope). */
  validationErrors?: Record<string, string | string[]>;
  children: ReactNode;
  className?: string;
  'aria-label'?: string;
}

/**
 * Form wrapper: validation on blur and submit, never on every keystroke (DESIGN_SYSTEM 5.4, 6.3).
 * The method is always POST: forms are handled in JavaScript, and a native submission before the
 * page is interactive must never put field values (a password, an NID) into the URL.
 */
export function Form({ onSubmit, validationErrors, children, className, ...aria }: FormProps) {
  return (
    <AriaForm
      method="post"
      className={cx('ui-form', className)}
      onSubmit={onSubmit}
      validationErrors={validationErrors}
      validationBehavior="aria"
      {...aria}
    >
      {children}
    </AriaForm>
  );
}

export interface FormSectionProps {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}

/** Section of a form as a fieldset with a legend. */
export function FormSection({ title, description, children, className }: FormSectionProps) {
  return (
    <fieldset className={cx('ui-form-section', className)}>
      <legend className="ui-form-legend">{title}</legend>
      {description && <p className="ui-form-desc">{description}</p>}
      {children}
    </fieldset>
  );
}

/** One column on phones, two columns from 640 px. */
export function FormGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('ui-form-grid', className)}>{children}</div>;
}

/** Row of form buttons: primary last on desktop, full width and in the thumb zone on phones. */
export function FormActions({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('ui-form-actions', className)}>{children}</div>;
}

export interface ErrorSummaryItem {
  /** id of the field's input, the link target. */
  fieldId: string;
  message: string;
}

export interface ErrorSummaryProps {
  errors: ErrorSummaryItem[];
  className?: string;
}

/**
 * Error summary at the top of a form after submit: lists every error as a link to its field and
 * receives focus (DESIGN_SYSTEM 6.3, 9).
 */
export function ErrorSummary({ errors, className }: ErrorSummaryProps) {
  const { messages } = useUi();
  const ref = useRef<HTMLDivElement>(null);
  const signature = errors.map((e) => `${e.fieldId}:${e.message}`).join('|');
  useEffect(() => {
    if (signature) ref.current?.focus();
  }, [signature]);
  if (errors.length === 0) return null;
  return (
    <div
      ref={ref}
      className={cx('ui-alert', 't-danger', 'ui-error-summary', className)}
      tabIndex={-1}
      role="alert"
    >
      <Icon icon={CircleAlert} />
      <div className="ui-alert-body">
        <p className="ui-alert-title">{messages.field.errorSummaryTitle}</p>
        <ul>
          {errors.map((error) => (
            <li key={error.fieldId}>
              <a
                href={`#${error.fieldId}`}
                onClick={(event) => {
                  const target = document.getElementById(error.fieldId);
                  if (!target) return;
                  event.preventDefault();
                  target.focus();
                  target.scrollIntoView?.({ block: 'center' });
                }}
              >
                {error.message}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
