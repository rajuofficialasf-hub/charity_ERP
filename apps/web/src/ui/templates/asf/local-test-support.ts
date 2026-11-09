// Helpers of the tests of the pieces this app added to the asf template (ui.local*.test.tsx).
import axe from 'axe-core';
import { vi, expect } from 'vitest';

/** A device whose media queries answer by `matches`, with the older listener API MUI still calls. */
export function stubMatchMedia(matches: (query: string) => boolean) {
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

/** A phone below the md breakpoint, or a wide screen; the device stays light. */
export function stubWidth(phone: boolean) {
  stubMatchMedia((query) => !query.includes('dark') && (query.includes('max-width') ? phone : !phone));
}

export async function expectNoAxeViolations(container: HTMLElement) {
  // jsdom lays nothing out, so colour contrast is checked in the browser runs instead
  const result = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
  expect(result.violations.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.html).join(' | ')}`)).toEqual([]);
}

/** Leaves the page as a fresh test expects it: no stubs, nothing stored, no colour scheme. */
export function resetPage() {
  vi.unstubAllGlobals();
  window.localStorage.clear();
  document.documentElement.removeAttribute('data-color-scheme');
}
