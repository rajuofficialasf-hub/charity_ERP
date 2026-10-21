/**
 * Recognises the database's own refusals in an error from Prisma, whatever shape it arrives in: a
 * known request error with a code, a raw statement's error with the SQLSTATE in its meta, or a
 * commit that a deferred trigger refused, with the text in the message or a cause.
 */
function mentions(error: unknown, test: (record: Record<string, unknown>) => boolean): boolean {
  const seen = new Set<unknown>();
  const visit = (value: unknown): boolean => {
    if (value === null || typeof value !== 'object' || seen.has(value)) return false;
    seen.add(value);
    const record = value as Record<string, unknown>;
    if (test(record)) return true;
    return ['cause', 'meta', 'driverAdapterError'].some((key) => visit(record[key]));
  };
  return visit(error);
}

const text = (record: Record<string, unknown>) =>
  [record.message, record.originalMessage, record.code, record.originalCode]
    .filter((v): v is string => typeof v === 'string')
    .join(' ');

/** A unique index refused a row (P2002 through the client, 23505 through a raw statement). */
export const isUniqueViolation = (error: unknown) =>
  mentions(
    error,
    (r) =>
      r.code === 'P2002' ||
      r.code === '23505' ||
      r.originalCode === '23505' ||
      /\b23505\b/.test(JSON.stringify(r.meta ?? '')),
  );

/**
 * The database refused a volunteer's own mobile as a beneficiary's mobile on one of the volunteer's
 * applications; the deferred trigger raises it when the transaction commits.
 */
export const isVolunteerMobileRefusal = (error: unknown) =>
  mentions(
    error,
    (r) =>
      text(r).includes('beneficiary_mobile_is_volunteer_mobile') ||
      JSON.stringify(r.meta ?? '').includes('beneficiary_mobile_is_volunteer_mobile'),
  );
