// @vitest-environment jsdom
// The pieces this app added to the asf template (listed in local.json), apart from the kit's shared
// contract tests, so those stay identical to the kit's copies.
import '@testing-library/jest-dom/vitest';

import userEvent from '@testing-library/user-event';
import { vi, it, expect, describe, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';

import { UiProvider, ColorModeButton } from './index';

/** A device whose media queries answer by `matches`, with the older listener API MUI still calls. */
function stubMatchMedia(matches: (query: string) => boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: matches(query),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
  document.documentElement.removeAttribute('data-color-scheme');
});

describe('colour mode', () => {
  it('takes the device dark mode while the person has not picked one', async () => {
    stubMatchMedia((query) => query.includes('dark'));
    render(
      <UiProvider>
        <ColorModeButton />
      </UiProvider>
    );
    await waitFor(() => expect(document.documentElement).toHaveAttribute('data-color-scheme', 'dark'));
    expect(screen.getByRole('button', { name: 'Switch to light mode' })).toBeInTheDocument();
  });

  it('switches to dark on a tap and keeps the choice on the device', async () => {
    stubMatchMedia(() => false);
    const user = userEvent.setup();
    render(
      <UiProvider>
        <ColorModeButton />
      </UiProvider>
    );
    await user.click(screen.getByRole('button', { name: 'Switch to dark mode' }));
    await waitFor(() => expect(document.documentElement).toHaveAttribute('data-color-scheme', 'dark'));
    expect(screen.getByRole('button', { name: 'Switch to light mode' })).toBeInTheDocument();
    expect(window.localStorage.getItem('asf-mode')).toBe('dark');
  });
});
