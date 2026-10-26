import type { FieldType } from '@css/shared/forms';
import type { IconComponent } from '@css/ui';
import {
  AlignLeft,
  Banknote,
  Calculator,
  Table,
  CalendarClock,
  CalendarDays,
  CircleDot,
  Clock3,
  Hash,
  ImagePlus,
  List,
  ListChecks,
  ListPlus,
  Mail,
  MapPin,
  MapPinned,
  Paperclip,
  Phone,
  Signature,
  SquareCheck,
  Text,
  TextCursorInput,
} from 'lucide-react';

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
export const TYPE_META: Readonly<Record<FieldType, { icon: IconComponent; group: TypeGroup }>> = {
  short_text: { icon: TextCursorInput, group: 'text' },
  long_text: { icon: AlignLeft, group: 'text' },
  number: { icon: Hash, group: 'number' },
  decimal: { icon: Hash, group: 'number' },
  money: { icon: Banknote, group: 'number' },
  phone: { icon: Phone, group: 'number' },
  email: { icon: Mail, group: 'text' },
  date: { icon: CalendarDays, group: 'datetime' },
  time: { icon: Clock3, group: 'datetime' },
  datetime: { icon: CalendarClock, group: 'datetime' },
  single_select: { icon: List, group: 'choice' },
  multi_select: { icon: ListChecks, group: 'choice' },
  radio: { icon: CircleDot, group: 'choice' },
  checkbox: { icon: SquareCheck, group: 'choice' },
  photo: { icon: ImagePlus, group: 'files' },
  file: { icon: Paperclip, group: 'files' },
  signature: { icon: Signature, group: 'files' },
  gps: { icon: MapPin, group: 'special' },
  bd_address: { icon: MapPinned, group: 'special' },
  repeat_group: { icon: ListPlus, group: 'special' },
  calculation: { icon: Calculator, group: 'special' },
  number_table: { icon: Table, group: 'number' },
  note: { icon: Text, group: 'special' },
};

/** The types of a group, in the order the builder offers them. */
export const typesOfGroup = (group: TypeGroup): FieldType[] =>
  (Object.keys(TYPE_META) as FieldType[]).filter((t) => TYPE_META[t].group === group);
