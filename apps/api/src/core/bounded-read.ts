import { ApiError } from '../i18n/api-error';
import type { PrismaService, Tx } from './prisma.service';

/** How long one read of a nationwide list may run (DECISION_LOG O-67, D-094). */
export const LIST_QUERY_TIMEOUT_MS = 5_000;

/** PostgreSQL cancelled the statement because of `statement_timeout` (SQLSTATE 57014). */
function isStatementTimeout(error: unknown): boolean {
  const seen = new Set<unknown>();
  const visit = (value: unknown): boolean => {
    if (value === null || typeof value !== 'object' || seen.has(value)) return false;
    seen.add(value);
    const record = value as Record<string, unknown>;
    if (record.code === '57014' || record.originalCode === '57014') return true;
    if (typeof record.message === 'string' && record.message.includes('statement timeout'))
      return true;
    return ['cause', 'meta'].some((key) => visit(record[key]));
  };
  return visit(error);
}

/**
 * Runs the reads of one list, statistics or profile answer in a read transaction that PostgreSQL
 * stops after the time limit, so a heavy filter cannot hold the database for everyone; a stopped
 * read answers 503 `server.busy`.
 */
export async function boundedRead<T>(
  prisma: PrismaService,
  read: (tx: Tx) => Promise<T>,
  timeoutMs = LIST_QUERY_TIMEOUT_MS,
): Promise<T> {
  const limit = Math.max(1, Math.trunc(timeoutMs));
  try {
    return await prisma.$transaction(
      async (tx) => {
        // a whole number of milliseconds, never user input
        await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = ${limit}`);
        return read(tx);
      },
      { timeout: limit + 10_000 },
    );
  } catch (error) {
    if (isStatementTimeout(error)) throw new ApiError('server.busy', 503);
    throw error;
  }
}
