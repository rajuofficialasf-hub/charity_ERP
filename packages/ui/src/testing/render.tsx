import { render, type RenderOptions, type RenderResult } from '@testing-library/react';
import type { ReactElement } from 'react';
import { exampleMessages } from '../provider/example-messages.js';
import { UiProvider, type UiLocale } from '../provider/UiProvider.js';

/** English digits with lakh grouping, standing in for packages/shared/format until T1.5. */
export const testFormatNumber = (value: number): string => value.toLocaleString('en-IN');

/** Renders a component inside UiProvider with the example messages of one language. */
export function renderWithUi(
  ui: ReactElement,
  { locale = 'en', ...options }: { locale?: UiLocale } & Omit<RenderOptions, 'wrapper'> = {},
): RenderResult {
  return render(ui, {
    ...options,
    wrapper: ({ children }) => (
      <UiProvider
        locale={locale}
        // eslint-disable-next-line security/detect-object-injection -- typed union key into a constant table
        messages={exampleMessages[locale]}
        formatNumber={testFormatNumber}
      >
        {children}
      </UiProvider>
    ),
  });
}
