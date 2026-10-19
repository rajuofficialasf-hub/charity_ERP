import { formatCount } from '@css/shared/format';
import { bn, en } from '@css/shared/i18n';
import { render, type RenderOptions, type RenderResult } from '@testing-library/react';
import type { ReactElement } from 'react';
import type { UiMessages } from '../provider/messages.js';
import { UiProvider, type UiLocale } from '../provider/UiProvider.js';

/**
 * The design system's texts from the `ui` namespace of the catalogue (T1.5). Typing them as
 * UiMessages makes a key missing in either language fail the typecheck.
 */
export const uiMessages: Record<UiLocale, UiMessages> = { bn: bn.ui, en: en.ui };

/** Renders a component inside UiProvider with the catalogue texts of one language. */
export function renderWithUi(
  ui: ReactElement,
  {
    locale = 'en',
    navigate,
    ...options
  }: {
    locale?: UiLocale;
    /** Client-side navigation for links, as the app's router supplies it. */
    navigate?: (href: string) => void;
  } & Omit<RenderOptions, 'wrapper'> = {},
): RenderResult {
  return render(ui, {
    ...options,
    wrapper: ({ children }) => (
      <UiProvider
        locale={locale}
        // eslint-disable-next-line security/detect-object-injection -- typed union key into a constant table
        messages={uiMessages[locale]}
        formatNumber={(value) => formatCount(value, locale)}
        navigate={navigate}
      >
        {children}
      </UiProvider>
    ),
  });
}
