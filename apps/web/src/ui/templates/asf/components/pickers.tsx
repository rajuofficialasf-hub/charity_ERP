import type { Dayjs } from 'dayjs';
import type { DateFieldProps, TimeFieldProps, MonthFieldProps } from '@/ui/contract';

import dayjs from 'dayjs';

import { TimePicker } from '@mui/x-date-pickers/TimePicker';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';

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

const write = (value: Dayjs | null, format: string) => (value && value.isValid() ? value.format(format) : '');

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
  };
}
const ClockIcon = () => <Icon name="clock" size={22} />;

function fieldSlot({ name, error, hint, required, onBlur }: Pick<DateFieldProps, 'name' | 'error' | 'hint' | 'required' | 'onBlur'>) {
  return { textField: { name, required, fullWidth: true, error: Boolean(error), helperText: error ?? hint, onBlur } };
}

export function DateField({ label, value, onChange, disabled, min, max, ...field }: DateFieldProps) {
  const localeText = useLocaleText();
  return (
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
      slots={{ openPickerIcon: CalendarIcon }}
      slotProps={fieldSlot(field)}
    />
  );
}

export function MonthField({ label, value, onChange, disabled, min, max, ...field }: MonthFieldProps) {
  const localeText = useLocaleText();
  return (
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
