'use client';

import { parseDate, type CalendarDate } from '@internationalized/date';
import { useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  Button as AriaButton,
  Calendar,
  CalendarCell,
  CalendarGrid,
  DateInput,
  DatePicker,
  DateSegment,
  Dialog,
  Group,
  Heading,
  Modal,
  ModalOverlay,
  Popover,
} from 'react-aria-components';
import { useUi } from '../../provider/UiProvider.js';
import { Icon } from '../Icon/Icon.js';
import { FieldFooter, FieldLabel, fieldClass, type FieldBaseProps } from './FieldParts.js';

export interface DateFieldProps extends FieldBaseProps {
  /** ISO date yyyy-mm-dd, or null when empty. */
  value?: string | null;
  defaultValue?: string | null;
  onChange?: (iso: string | null) => void;
  /** Earliest and latest allowed ISO dates. */
  min?: string;
  max?: string;
}

const toDate = (iso?: string | null): CalendarDate | null | undefined =>
  iso === undefined ? undefined : iso === null ? null : parseDate(iso);

function isPhone(): boolean {
  return (
    typeof window !== 'undefined' && window.matchMedia?.('(max-width: 639px)').matches === true
  );
}

function CalendarBody() {
  const { messages } = useUi();
  return (
    <Calendar className="ui-calendar">
      <header className="ui-calendar-head">
        <AriaButton
          slot="previous"
          className="ui-calendar-nav"
          aria-label={messages.field.previousMonth}
        >
          <Icon icon={ChevronLeft} />
        </AriaButton>
        <Heading className="ui-calendar-title" />
        <AriaButton slot="next" className="ui-calendar-nav" aria-label={messages.field.nextMonth}>
          <Icon icon={ChevronRight} />
        </AriaButton>
      </header>
      <CalendarGrid className="ui-calendar-grid">
        {(date) => <CalendarCell date={date} className="ui-calendar-cell" />}
      </CalendarGrid>
    </Calendar>
  );
}

/**
 * Date picker at every screen size (O-55): segments typed with the numeric keypad and shown as
 * dd-mm-yyyy with English digits (O-43, UX-05); the calendar opens as a popover on desktop and as a
 * bottom sheet on phones.
 */
export function DateField({ value, defaultValue, onChange, min, max, ...field }: DateFieldProps) {
  const { messages } = useUi();
  const [sheet, setSheet] = useState(false);
  return (
    <DatePicker
      className={fieldClass(field)}
      id={field.id}
      name={field.name}
      value={toDate(value)}
      defaultValue={toDate(defaultValue)}
      onChange={(d) => onChange?.(d ? d.toString() : null)}
      minValue={toDate(min) ?? undefined}
      maxValue={toDate(max) ?? undefined}
      onOpenChange={(open) => open && setSheet(isPhone())}
      isRequired={field.required}
      isInvalid={!!field.error}
      isReadOnly={field.readOnly || field.locked}
      isDisabled={field.disabled}
      validationBehavior="aria"
      shouldForceLeadingZeros
    >
      <FieldLabel {...field} />
      <Group className="ui-input ui-date-group">
        <DateInput className="ui-date-input">
          {(segment) =>
            segment.type === 'literal' ? (
              <span aria-hidden="true" className="ui-date-literal">
                -
              </span>
            ) : (
              <DateSegment segment={segment} className="ui-date-segment" />
            )
          }
        </DateInput>
        <AriaButton className="ui-input-button" aria-label={messages.field.openCalendar}>
          <Icon icon={CalendarDays} />
        </AriaButton>
      </Group>
      <FieldFooter {...field} />
      {sheet ? (
        <ModalOverlay className="ui-overlay" isDismissable>
          <Modal className="ui-dialog ui-sheet">
            <Dialog className="ui-dialog-body" aria-label={field.label}>
              <span className="ui-sheet-handle" aria-hidden="true" />
              <CalendarBody />
            </Dialog>
          </Modal>
        </ModalOverlay>
      ) : (
        <Popover className="ui-popover ui-popover-calendar" placement="bottom end">
          <Dialog className="ui-popover-dialog" aria-label={field.label}>
            <CalendarBody />
          </Dialog>
        </Popover>
      )}
    </DatePicker>
  );
}
