// The calls the web app makes to its API, read from its source, and the one form both the source
// and the contract run write a call in, so the coverage check can compare them.

/** METHOD and path with every id or interpolated part replaced by `{}` and the query dropped. */
export function normalizedCall(method: string, path: string): string {
  const bare = path.split('?')[0]!;
  const parts = bare
    .split('/')
    .map((part) =>
      /\$\{|^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$|^\d+$|^[A-Z]{2,5}-\d{4}-\d+$/i.test(
        part,
      )
        ? '{}'
        : part,
    );
  return `${method.toUpperCase()} ${parts.join('/')}`;
}

/**
 * Every `api<…>(path, options)` call of one source file whose path starts as a literal: its method
 * (GET unless the options name another) and its normalized path. A path built elsewhere is
 * reported by its file and line, so the coverage check can name it.
 */
export function callsIn(source: string): { calls: string[]; unread: number[] } {
  const calls: string[] = [];
  const unread: number[] = [];
  // the type argument holds no parentheses, so it runs to the last `>` before the call's `(`
  const pattern = /\bapi<[^()]*>\(\s*/g;
  for (let m = pattern.exec(source); m; m = pattern.exec(source)) {
    const start = m.index + m[0].length;
    const quote = source.charAt(start);
    const line = source.slice(0, m.index).split('\n').length;
    if (quote !== "'" && quote !== '`') {
      unread.push(line);
      continue;
    }
    const end = source.indexOf(quote, start + 1);
    // the admin lists' `listQuery(…)` only ever adds a query (`?a=1` or nothing), so the path
    // ends where it starts
    const path = source.slice(start + 1, end).split('${listQuery(')[0]!;
    // the method sits in the options object that follows the path, before the call closes
    const rest = source.slice(end + 1, end + 400);
    const close = rest.search(/\)\s*[;,.)\n]/);
    const options = close === -1 ? rest : rest.slice(0, close);
    const method = /method:\s*'([A-Z]+)'/.exec(options)?.[1] ?? 'GET';
    calls.push(normalizedCall(method, path));
  }
  return { calls, unread };
}
