/**
 * Up to two initials; Bengali names keep their first grapheme of the first two words. One initial
 * is the first letter alone ("স" of "স্বেচ্ছাসেবক"), as a calm list shows it.
 */
export function initials(name: string, letters: 1 | 2): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (letters === 1) return (Array.from(words[0] ?? '')[0] ?? '').toLocaleUpperCase();
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  return words
    .slice(0, letters)
    .map((w) => segmenter.segment(w)[Symbol.iterator]().next().value?.segment ?? '')
    .join('');
}
