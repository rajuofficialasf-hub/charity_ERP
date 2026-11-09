/**
 * A question's text or help may repeat an earlier answer: `{{field_key}}`, or
 * `{{field_key|fallback}}` with the words read while the answer is empty. The result is always plain
 * text; whoever shows it renders it as text, never as markup.
 */

const BRACES = /\{\{([^{}]*)\}\}/g;
const KEY = /^[a-z][a-z0-9_]*$/;

/** The key and the fallback of a token's inside, or null when it names no field key. */
function token(inside: string): { key: string; fallback: string | undefined } | null {
  const bar = inside.indexOf('|');
  const key = bar === -1 ? inside : inside.slice(0, bar);
  if (!KEY.test(key)) return null;
  return { key, fallback: bar === -1 ? undefined : inside.slice(bar + 1) };
}

/** The field keys a text names, in order, each once. */
export function pipeKeys(text: string): string[] {
  const keys: string[] = [];
  for (const match of text.matchAll(BRACES)) {
    const found = token(match[1]!);
    if (found && !keys.includes(found.key)) keys.push(found.key);
  }
  return keys;
}

/** The text with each token replaced by its answer, its fallback, or nothing. */
export function pipeText(text: string, read: (key: string) => string | null): string {
  return text.replace(BRACES, (whole, inside: string) => {
    const found = token(inside);
    return found ? (read(found.key) ?? found.fallback ?? '') : whole;
  });
}
