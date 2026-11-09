/**
 * The values of the export service the owner decided (docs/DECISION_LOG.md, the export service
 * decision of 2026-11-01). Changing one is a decision, not a setting: nothing here is editable in
 * the app.
 */

/** The lists a person exports with the columns they choose. */
export const EXPORT_LISTS = ['volunteers', 'beneficiaries', 'applications'] as const;
export type ExportList = (typeof EXPORT_LISTS)[number];

/** The records printed whole as a PDF. */
export const EXPORT_RECORDS = ['beneficiary_profile', 'application'] as const;
export type ExportRecord = (typeof EXPORT_RECORDS)[number];

/** Whether an export kind prints one record. */
export function isExportRecord(kind: string): kind is ExportRecord {
  return (EXPORT_RECORDS as readonly string[]).includes(kind);
}

/** Every kind of export job: a list or a record. */
export const EXPORT_KINDS = [...EXPORT_LISTS, ...EXPORT_RECORDS] as const;
export type ExportKind = (typeof EXPORT_KINDS)[number];

export const EXPORT_FORMATS = ['xlsx', 'csv', 'pdf'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export const EXPORT_STATES = ['queued', 'running', 'done', 'failed'] as const;
export type ExportState = (typeof EXPORT_STATES)[number];

export const EXPORT_LIMITS = {
  /** An Excel or CSV file holds at most this many rows; more asks for narrower filters. */
  maxRows: 100_000,
  /** A list printed as a PDF holds at most this many rows; more asks for Excel or CSV. */
  maxPdfRows: 1_000,
  /** A person holds at most this many waiting or running exports at a time. */
  maxRunning: 3,
  /** The most columns one export may ask for (the form questions included). */
  maxColumns: 500,
  /** A finished file is kept this many days, then deleted; its job stays. */
  keepDays: 30,
  /** A job waiting or running longer than this is failed by the daily sweep. */
  stuckMinutes: 30,
  /** The job reads and writes the rows in batches of this size. */
  batchRows: 1_000,
} as const;

/**
 * The protected classes an export may carry only with an export permission of its own, beyond
 * seeing them on screen: the identity numbers, the bank details and the official section.
 */
export const EXPORT_PERMISSION_OF_CLASS: Readonly<Record<string, string>> = {
  'beneficiary.nid': 'export.beneficiaries',
  'volunteer.identity': 'export.volunteers',
  'volunteer.bank': 'export.volunteers',
  'application.official_section': 'export.forms',
};
