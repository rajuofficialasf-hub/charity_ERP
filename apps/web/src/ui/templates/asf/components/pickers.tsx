import type { Dayjs } from 'dayjs';
import type { DateFieldProps, TimeFieldProps, MonthFieldProps } from '@/ui/contract';

import type { ReactNode } from 'react';

import dayjs from 'dayjs';

import { TimePicker } from '@mui/x-date-pickers/TimePicker';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';

import { Icon } from './icon';
import { useLabels } from './labels';

// ----------------------------------------------------------------------

// Values cross the contract as ISO strings ("2026-10-25", "09:30", "2026-10") and "" when empty.
const DATE = 'YYYY-MM-DD';
const MONTH = 'YYYY-MM';
const TIME = 'HH:mm';

const parse = (value: string, format: string): Dayjs | null => {
  if (!value) return null;
  const parsed = dayjs(format === TIME ? `2000-01-01T${value}` : value);
  return parsed.isValid() ? parsed : null;
};

const write = (value: Dayjs | null, format: string) =>
  value && value.isValid() ? value.format(format) : '';

const CalendarIcon = () => <Icon name="calendar" size={22} />;

/** The picker's own words (the parts of a date, the calendar's buttons) in the app's language. */
function useLocaleText() {
  const labels = useLabels();
  return {
    openDatePickerDialogue: () => labels.openCalendar,
    previousMonth: labels.previousMonth,
    nextMonth: labels.nextMonth,
    day: labels.datePartDay,
    month: labels.datePartMonth,
    year: labels.datePartYear,
    empty: labels.datePartEmpty,
    calendarViewSwitchingButtonAriaLabel: (view: string) =>
      view === 'year' ? labels.switchToDayView : labels.switchToYearView,
  };
}

const LOCALIZED_FORMATS = {
  LT: 'HH:mm',
  LTS: 'HH:mm:ss',
  L: 'DD-MM-YYYY',
  LL: 'D MMMM YYYY',
  LLL: 'D MMMM YYYY HH:mm',
  LLLL: 'dddd, D MMMM YYYY HH:mm',
};

/**
 * The calendar's month and day names from the labels, as a dayjs locale of their own: the page's
 * language names them, and the dates keep the English digits the app writes everywhere.
 */
function CalendarWords({ children }: { children: ReactNode }) {
  const labels = useLabels();
  const months = labels.monthNames.split(',');
  const days = labels.weekdayNames.split(',');
  // dayjs finds a locale again by its name in lower case
  const name = `asf-${months[0]}-${days[0]}`.toLowerCase();
  dayjs.locale(
    {
      name,
      months,
      monthsShort: months,
      weekdays: days,
      weekdaysShort: days,
      weekdaysMin: days,
      weekStart: 0,
      // the picker reads the localized formats; the app writes its own, so these only fill them
      formats: LOCALIZED_FORMATS,
      ordinal: (n: number) => String(n),
      // the calendar never writes a relative time, the one part of a locale it leaves out
    } as ILocale,
    undefined,
    true,
  );
  return (
    <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale={name}>
      {children}
    </LocalizationProvider>
  );
}
const ClockIcon = () => <Icon name="clock" size={22} />;

function fieldSlot({
  name,
  error,
  hint,
  required,
  onBlur,
}: Pick<DateFieldProps, 'name' | 'error' | 'hint' | 'required' | 'onBlur'>) {
  return {
    textField: {
      name,
      required,
      fullWidth: true,
      error: Boolean(error),
      helperText: error ?? hint,
      onBlur,
    },
  };
}

export function DateField({
  label,
  value,
  onChange,
  disabled,
  min,
  max,
  ...field
}: DateFieldProps) {
  const localeText = useLocaleText();
  return (
    <CalendarWords>
      <DatePicker
        localeText={localeText}
        label={label}
        value={parse(value, DATE)}
        onChange={(next) => onChange(write(next, DATE))}
        disabled={disabled}
        minDate={min ? dayjs(min) : undefined}
        maxDate={max ? dayjs(max) : undefined}
        // the app writes every date day-month-year in English digits
        format="DD-MM-YYYY"
        // the day's short name as the labels give it, not its first letter
        dayOfWeekFormatter={(day) => day.format('dd')}
        slots={{ openPickerIcon: CalendarIcon }}
        slotProps={fieldSlot(field)}
      />
    </CalendarWords>
  );
}

export function MonthField({
  label,
  value,
  onChange,
  disabled,
  min,
  max,
  ...field
}: MonthFieldProps) {
  const localeText = useLocaleText();
  return (
    <CalendarWords>
      <DatePicker
        localeText={localeText}
        label={label}
        views={['year', 'month']}
        openTo="month"
        value={parse(value, MONTH)}
        onChange={(next) => onChange(write(next, MONTH))}
        disabled={disabled}
        minDate={min ? dayjs(min) : undefined}
        maxDate={max ? dayjs(max) : undefined}
        format="MMMM YYYY"
        slots={{ openPickerIcon: CalendarIcon }}
        slotProps={fieldSlot(field)}
      />
    </CalendarWords>
  );
}

export function TimeField({ label, value, onChange, disabled, ...field }: TimeFieldProps) {
  return (
    <TimePicker
      label={label}
      value={parse(value, TIME)}
      onChange={(next) => onChange(write(next, TIME))}
      disabled={disabled}
      slots={{ openPickerIcon: ClockIcon }}
      slotProps={fieldSlot(field)}
    />
  );
}
