import { bn, en } from '@css/shared/i18n';
import { describe, expect, it } from 'vitest';
import { DEFAULT_LABELS } from '@/ui/templates/asf/components/labels';

// The words the asf UI system shows on its own come from the catalogue's `ui.asf` group in both
// languages (docs/architecture/ADR/ADR-016-asf-ui-system.md), never from the template's English
// defaults.
describe('the words of the asf UI system', () => {
  const keys = Object.keys(DEFAULT_LABELS).sort();

  it.each([
    ['bn', bn],
    ['en', en],
  ])('has every one of them in %s, and nothing else', (_, catalogue) => {
    const words: Record<string, string> = catalogue.ui.asf;
    expect(Object.keys(words).sort()).toEqual(keys);
    for (const key of keys) expect(words[key]?.trim(), key).toBeTruthy();
  });

  it('keeps the placeholders of the page range in both languages', () => {
    for (const catalogue of [bn, en]) {
      const range = catalogue.ui.asf.rowsRange;
      for (const name of ['{from}', '{to}', '{total}']) expect(range).toContain(name);
    }
  });
});
