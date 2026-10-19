import Drawer from '@mui/material/Drawer';
import type { DialogProps } from '@mui/material/Dialog';
import useMediaQuery from '@mui/material/useMediaQuery';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DesktopDatePicker } from '@mui/x-date-pickers/DesktopDatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { MobileDatePicker } from '@mui/x-date-pickers/MobileDatePicker';
import type { PickersLocaleText } from '@mui/x-date-pickers/locales';
import dayjs, { type Dayjs } from 'dayjs';
import 'dayjs/locale/bn';
import 'dayjs/locale/en-gb';
import { CalendarDays } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import {
  NativeFieldFooter,
  NativeFieldLabel,
  fieldClass,
  useFieldIds,
} from '../../components/Field/FieldParts.js';
import { Icon } from '../../components/Icon/Icon.js';
import type { DateFieldProps } from '../../contract.js';
import { useUi, type UiLocale } from '../../provider/UiProvider.js';
import { insideDialog } from './portal.js';

/** dayjs locales: Bengali or British names, both with English digits and the day first. */
const DAYJS_LOCALE: Record<UiLocale, string> = { bn: 'bn', en: 'en-gb' };
const SHOWN = 'DD-MM-YYYY';
const STORED = 'YYYY-MM-DD';

const toDay = (iso: string | null | undefined): Dayjs | null | undefined =>
  iso === undefined ? undefined : iso === null ? null : dayjs(iso, STORED);
const toIso = (day: Dayjs | null): string | null =>
  day !== null && day.isValid() ? day.format(STORED) : null;

/** The calendar of a phone as a bottom sheet, in place of the picker's centred dialog. */
function BottomSheet({ open, onClose, children, ...props }: DialogProps) {
  const label = props['aria-label'];
  const sheet = useRef<HTMLDivElement>(null);
  return (
    <Drawer
      anchor="bottom"
      open={open}
      onClose={(event) => onClose?.(event, 'backdropClick')}
      container={() => insideDialog(sheet.current)}
      slotProps={{
        paper: {
          className: 'ui-date-sheet',
          role: 'dialog',
          'aria-modal': true,
          'aria-label': label,
        },
      }}
    >
      <span className="ui-sheet-handle" aria-hidden="true" />
      {children}
    </Drawer>
  );
}

/**
 * Date field on MUI's date picker: day, month and year parts typed with the numeric keypad and
 * shown as dd-mm-yyyy with English digits; the calendar opens below the field on wider screens
 * and as a bottom sheet on phones. The value is an ISO date.
 */
export function DateField({ value, defaultValue, onChange, min, max, ...field }: DateFieldProps) {
  const { messages, locale } = useUi();
  const ids = useFieldIds(field.id);
  const labelId = `${ids.inputId}-label`;
  const wrapper = useRef<HTMLDivElement>(null);
  const phone = useMediaQuery('(max-width: 639.95px)');
  const [outOfRange, setOutOfRange] = useState(false);
  const [inner, setInner] = useState<string | null>(defaultValue ?? null);
  const iso = value === undefined ? inner : value;
  const shown = useMemo(() => toDay(value), [value]);
  const first = useMemo(() => toDay(defaultValue), [defaultValue]);
  const minDate = useMemo(() => (min ? dayjs(min, STORED) : undefined), [min]);
  const maxDate = useMemo(() => (max ? dayjs(max, STORED) : undefined), [max]);
  const invalid = !!field.error || outOfRange;
  const describedBy =
    [field.helper && ids.helperId, field.error && ids.errorId].filter(Boolean).join(' ') ||
    undefined;
  const text = messages.field;
  const localeText: Partial<PickersLocaleText> = {
    previousMonth: text.previousMonth,
    nextMonth: text.nextMonth,
    openDatePickerDialogue: () => text.openCalendar,
    fieldDayPlaceholder: () => text.dayPlaceholder,
    fieldMonthPlaceholder: () => text.monthPlaceholder,
    fieldYearPlaceholder: () => text.yearPlaceholder,
    day: text.day,
    month: text.month,
    year: text.year,
    empty: text.emptyPart,
  };
  const Picker = phone ? MobileDatePicker : DesktopDatePicker;

  return (
    <div ref={wrapper} className={fieldClass(field)} data-control="date">
      <NativeFieldLabel {...field} labelId={labelId} />
      <LocalizationProvider
        dateAdapter={AdapterDayjs}
        // eslint-disable-next-line security/detect-object-injection -- typed union key into a constant table
        adapterLocale={DAYJS_LOCALE[locale]}
        localeText={localeText}
      >
        <Picker
          {...(value === undefined ? { defaultValue: first ?? null } : { value: shown ?? null })}
          onChange={(next, context) => {
            const reported = toIso(next);
            setInner(reported);
            setOutOfRange(
              context.validationError === 'minDate' || context.validationError === 'maxDate',
            );
            onChange?.(reported);
          }}
          format={SHOWN}
          views={['day']}
          minDate={minDate}
          maxDate={maxDate}
          disabled={field.disabled}
          readOnly={field.readOnly || field.locked}
          closeOnSelect
          dayOfWeekFormatter={(day) => day.format('dd')}
          slots={{ openPickerIcon: () => <Icon icon={CalendarDays} />, dialog: BottomSheet }}
          slotProps={{
            textField: {
              id: ids.inputId,
              error: invalid,
              required: field.required,
              fullWidth: true,
              slotProps: {
                input: {
                  className: 'ui-input ui-date-group',
                  'aria-labelledby': labelId,
                  'aria-describedby': describedBy,
                  slotProps: {
                    sectionContent: {
                      'aria-invalid': invalid || undefined,
                      'aria-describedby': describedBy,
                    },
                  },
                },
              },
            },
            openPickerButton: { className: 'ui-input-button', disableRipple: true },
            toolbar: { hidden: true },
            actionBar: { actions: [] },
            dialog: { 'aria-label': field.label },
            popper: {
              className: 'ui-date-popper',
              container: () => insideDialog(wrapper.current),
            },
            desktopPaper: { className: 'ui-popover ui-date-paper' },
            layout: { className: 'ui-calendar' },
          }}
        />
      </LocalizationProvider>
      {field.name && <input type="hidden" name={field.name} value={iso ?? ''} />}
      <NativeFieldFooter {...field} ids={ids} />
    </div>
  );
}
