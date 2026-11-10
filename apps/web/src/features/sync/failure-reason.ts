/** The translator of the `errors` messages, as the pages hold it. */
interface ErrorsTranslator {
  (key: never, values?: never): string;
  has(key: never): boolean;
}

/**
 * The reason of a refused record in the reader's words: the server's code with the values its
 * message names (the question of an answer, say), or the page's own fallback for an unknown code.
 */
export function failureReason(
  te: ErrorsTranslator,
  code: string | null,
  params: Record<string, string> | null | undefined,
  fallback: string,
): string {
  if (!code || !te.has(code as never)) return fallback;
  return te(code as never, (params ?? undefined) as never);
}
