import type { ExportList } from './constants.js';

/**
 * How a column's values are written: text; a number or an amount; a calendar date or a moment;
 * a coded value, written as its words beside a column of its code; a yes or no.
 */
export const COLUMN_KINDS = [
  'text',
  'number',
  'money',
  'date',
  'datetime',
  'coded',
  'flag',
] as const;
export type ColumnKind = (typeof COLUMN_KINDS)[number];

/**
 * One column a list can export. `list` columns are the ones the list's page knows (the on-screen
 * ones among them ticked first); `detail` columns are further facts of the record. `cls` is the
 * protected class of `docs/security/permissions.yaml` (`sensitive_fields`) the column belongs
 * to, or null for a column every reader of the list sees.
 */
export interface ExportColumn {
  id: string;
  /** The message key of the column's header, in the `exports` namespace. */
  header: string;
  group: 'list' | 'detail';
  cls: string | null;
  onScreen: boolean;
  kind: ColumnKind;
}

/** The columns whose values are not plain text; every other column is text. */
const KINDS: Readonly<Record<ExportList, Readonly<Record<string, ColumnKind>>>> = {
  volunteers: {
    state: 'coded',
    inactive: 'flag',
    type: 'coded',
    blocked: 'flag',
    date_of_birth: 'date',
  },
  beneficiaries: {
    ben_no: 'number',
    status: 'coded',
    class: 'coded',
    gender: 'coded',
    age: 'number',
    mobile_owner: 'coded',
    blocked: 'flag',
    help_count: 'number',
    max_helps_in_year: 'number',
  },
  applications: { score: 'number', status: 'coded', submitted: 'datetime', waiting: 'number' },
};

const column = (
  list: ExportList,
  id: string,
  group: ExportColumn['group'],
  cls: string | null = null,
  onScreen = false,
): ExportColumn => ({
  id,
  header: `exports.column.${list}.${id}`,
  group,
  cls,
  onScreen,
  // eslint-disable-next-line security/detect-object-injection -- typed union key and a catalogue id
  kind: KINDS[list][id] ?? 'text',
});

const VOLUNTEER_IDENTITY = 'volunteer.identity';
const VOLUNTEER_BANK = 'volunteer.bank';
const VOLUNTEER_RATING = 'volunteer.rating';

const VOLUNTEERS: readonly ExportColumn[] = [
  column('volunteers', 'name', 'list', null, true),
  column('volunteers', 'area', 'list', null, true),
  column('volunteers', 'projects', 'list', null, true),
  column('volunteers', 'state', 'list', null, true),
  column('volunteers', 'category', 'list', VOLUNTEER_RATING, true),
  column('volunteers', 'inactive', 'detail', VOLUNTEER_RATING),
  column('volunteers', 'type', 'detail'),
  column('volunteers', 'mobile', 'detail'),
  column('volunteers', 'email', 'detail'),
  column('volunteers', 'blocked', 'detail'),
  column('volunteers', 'nid', 'detail', VOLUNTEER_IDENTITY),
  column('volunteers', 'date_of_birth', 'detail', VOLUNTEER_IDENTITY),
  column('volunteers', 'blood_group', 'detail', VOLUNTEER_IDENTITY),
  column('volunteers', 'bank_name', 'detail', VOLUNTEER_BANK),
  column('volunteers', 'bank_account_name', 'detail', VOLUNTEER_BANK),
  column('volunteers', 'bank_account_number', 'detail', VOLUNTEER_BANK),
  column('volunteers', 'bank_branch_name', 'detail', VOLUNTEER_BANK),
  column('volunteers', 'bank_routing_number', 'detail', VOLUNTEER_BANK),
];

const PROFILE = 'beneficiary.profile_detail';
const CONTACT = 'beneficiary.contact';
const ADDRESS = 'beneficiary.address_detail';
const HISTORY = 'beneficiary.application_history';

const BENEFICIARIES: readonly ExportColumn[] = [
  column('beneficiaries', 'name', 'list', null, true),
  column('beneficiaries', 'ben_no', 'list', null, true),
  column('beneficiaries', 'father', 'list', PROFILE, true),
  column('beneficiaries', 'area', 'list', null, true),
  // the times helped (and, among the details, the most of them in one year): the person's
  // application history, beside the area as the list shows it
  column('beneficiaries', 'help_count', 'list', HISTORY, true),
  column('beneficiaries', 'status', 'list', null, true),
  column('beneficiaries', 'class', 'detail', PROFILE),
  column('beneficiaries', 'gender', 'detail', PROFILE),
  column('beneficiaries', 'age', 'detail', PROFILE),
  column('beneficiaries', 'mother', 'detail', PROFILE),
  column('beneficiaries', 'mobile', 'detail', CONTACT),
  // whose number the mobile is, and that person's name: contact data like the number itself
  column('beneficiaries', 'mobile_owner', 'detail', CONTACT),
  column('beneficiaries', 'mobile_owner_name', 'detail', CONTACT),
  column('beneficiaries', 'union', 'detail', ADDRESS),
  column('beneficiaries', 'village', 'detail', ADDRESS),
  column('beneficiaries', 'blocked', 'detail', 'beneficiary.care'),
  column('beneficiaries', 'max_helps_in_year', 'detail', HISTORY),
  column('beneficiaries', 'nid', 'detail', 'beneficiary.nid'),
  column('beneficiaries', 'birth_reg', 'detail', 'beneficiary.nid'),
];

const APPLICATIONS: readonly ExportColumn[] = [
  column('applications', 'app_no', 'list', null, true),
  column('applications', 'person', 'list', null, true),
  column('applications', 'score', 'list', 'application.official_section', true),
  column('applications', 'area', 'list', null, true),
  column('applications', 'status', 'list', null, true),
  column('applications', 'submitted', 'list', null, true),
  column('applications', 'waiting', 'list', null, true),
  column('applications', 'stage', 'detail'),
  column('applications', 'outcome', 'detail'),
  column('applications', 'flags', 'detail'),
  column('applications', 'volunteer', 'detail'),
  column('applications', 'union', 'detail'),
];

const CATALOGUES: Readonly<Record<ExportList, readonly ExportColumn[]>> = {
  volunteers: VOLUNTEERS,
  beneficiaries: BENEFICIARIES,
  applications: APPLICATIONS,
};

/** The columns a list can export, in the file's order: the list's own, then the details. */
export function columnsOf(list: ExportList): readonly ExportColumn[] {
  // eslint-disable-next-line security/detect-object-injection -- typed union key into a constant table
  return CATALOGUES[list];
}

const QUESTION_PREFIX = 'q:';

/** The column id of a form question, keyed by the question's field key across versions. */
export function questionColumnId(fieldKey: string): string {
  return `${QUESTION_PREFIX}${fieldKey}`;
}

/** The field key of a question column, or null for any other column. */
export function questionKeyOf(columnId: string): string | null {
  return columnId.startsWith(QUESTION_PREFIX) ? columnId.slice(QUESTION_PREFIX.length) : null;
}

/**
 * The chosen ids that are no column of the list; form questions count only on the application
 * list, and only those of the project's forms (`fieldKeys`).
 */
export function unknownColumns(
  list: ExportList,
  chosen: readonly string[],
  fieldKeys: readonly string[],
): string[] {
  const known = new Set(columnsOf(list).map((c) => c.id));
  const questions = new Set(list === 'applications' ? fieldKeys : []);
  return chosen.filter((id) => {
    const key = questionKeyOf(id);
    return key === null ? !known.has(id) : !questions.has(key);
  });
}

/**
 * The chosen columns in the file's fixed order, whatever order they were ticked in: the list's
 * columns, the details, then the questions in the form's order (`fieldKeys`). Ids the list does
 * not know are left out.
 */
export function orderColumns(
  list: ExportList,
  chosen: readonly string[],
  fieldKeys: readonly string[],
): string[] {
  const picked = new Set(chosen);
  const fixed = columnsOf(list)
    .map((c) => c.id)
    .filter((id) => picked.has(id));
  const questions =
    list === 'applications' ? fieldKeys.map(questionColumnId).filter((id) => picked.has(id)) : [];
  return [...fixed, ...questions];
}
