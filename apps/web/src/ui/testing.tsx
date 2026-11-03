// Test helpers for the asf UI system: render inside its provider with the catalogue's words, and
// fail a test on an axe violation. Only tests import this file.
import type { UiLabels } from '@/ui';
import type { ReactElement } from 'react';
import type { RenderOptions, RenderResult } from '@testing-library/react';

import axe from 'axe-core';
import { bn, en } from '@css/shared/i18n';
import { render } from '@testing-library/react';

import { UiProvider } from '@/ui';

/** The asf words of each language, as the app passes them to the provider. */
export const asfLabels: Record<'bn' | 'en', Partial<UiLabels>> = { bn: bn.ui.asf, en: en.ui.asf };

/** Renders a piece inside the asf provider with the words of one language. */
export function renderWithUi(
  ui: ReactElement,
  { locale = 'en', ...options }: { locale?: 'bn' | 'en' } & Omit<RenderOptions, 'wrapper'> = {},
): RenderResult {
  return render(ui, {
    ...options,
    wrapper: ({ children }) => <UiProvider labels={locale === 'bn' ? asfLabels.bn : asfLabels.en}>{children}</UiProvider>,
  });
}

/**
 * Runs axe-core on a rendered container and fails with each violation's rule and element. Colour
 * contrast needs a real layout and is checked in the browser runs instead.
 */
export async function expectNoAxeViolations(container: Element): Promise<void> {
  const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
  if (results.violations.length > 0) {
    const report = results.violations
      .map((v) => `${v.id} (${v.impact ?? 'n/a'}): ${v.help}\n  ${v.nodes.map((n) => n.target.join(' ')).join('\n  ')}`)
      .join('\n');
    throw new Error(`Accessibility violations found:\n${report}`);
  }
}
