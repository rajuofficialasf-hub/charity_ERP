import type { FieldType } from '@css/shared/forms';
import type { ExtendedIconName } from '@/ui';

/** The six groups the builder sorts the question types into. */
export type TypeGroup = 'text' | 'number' | 'choice' | 'datetime' | 'files' | 'special';
export const TYPE_GROUPS: readonly TypeGroup[] = [
  'text',
  'number',
  'choice',
  'datetime',
  'files',
  'special',
];

/** Each question type's icon and group; its plain name and example come from the catalogue. */
export const TYPE_META: Readonly<Record<FieldType, { icon: ExtendedIconName; group: TypeGroup }>> =
  {
    short_text: { icon: 'text-input', group: 'text' },
    long_text: { icon: 'text', group: 'text' },
    number: { icon: 'hash', group: 'number' },
    decimal: { icon: 'hash', group: 'number' },
    money: { icon: 'money', group: 'number' },
    phone: { icon: 'phone', group: 'number' },
    email: { icon: 'mail', group: 'text' },
    date: { icon: 'calendar', group: 'datetime' },
    time: { icon: 'clock', group: 'datetime' },
    datetime: { icon: 'schedule', group: 'datetime' },
    single_select: { icon: 'list', group: 'choice' },
    multi_select: { icon: 'checklist', group: 'choice' },
    radio: { icon: 'radio', group: 'choice' },
    checkbox: { icon: 'checkbox', group: 'choice' },
    photo: { icon: 'gallery-add', group: 'files' },
    file: { icon: 'attachment', group: 'files' },
    signature: { icon: 'edit-line', group: 'files' },
    gps: { icon: 'map-pin', group: 'special' },
    bd_address: { icon: 'map-pin', group: 'special' },
    repeat_group: { icon: 'list-add', group: 'special' },
    calculation: { icon: 'calculator', group: 'special' },
    number_table: { icon: 'table', group: 'number' },
    note: { icon: 'text', group: 'special' },
  };

/** The types of a group, in the order the builder offers them. */
export const typesOfGroup = (group: TypeGroup): FieldType[] =>
  (Object.keys(TYPE_META) as FieldType[]).filter((t) => TYPE_META[t].group === group);
