/** `?a=1&b=2` from the values that are set (the list calls of the nationwide tabs). */
export function listQuery(values: Record<string, string | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value) params.set(key, value);
  const text = params.toString();
  return text ? `?${text}` : '';
}
