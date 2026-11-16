// @vitest-environment jsdom
// The segmented control this app added to the asf template (listed in local.json): choices side by
// side in a named group, the chosen one pressed, and the language switch built on it.
import '@testing-library/jest-dom/vitest';

import { useState } from 'react';

import userEvent from '@testing-library/user-event';
import { it, expect, describe, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

import { UiProvider, LanguageSwitch, SegmentedControl } from './index';
import { resetPage, stubWidth, expectNoAxeViolations } from './local-test-support';

afterEach(() => {
  cleanup();
  resetPage();
});

const OPTIONS = [
  { value: 'cards', label: 'কার্ড' },
  { value: 'list', label: 'তালিকা' },
];

function Views() {
  const [view, setView] = useState('cards');
  return (
    <UiProvider>
      <SegmentedControl label="দেখার ধরন" value={view} options={OPTIONS} onChange={setView} />
      <p>{`এখন: ${view}`}</p>
    </UiProvider>
  );
}

describe('the segmented control', () => {
  it('names its group, presses the chosen choice and hands a new choice up', async () => {
    stubWidth(false);
    const user = userEvent.setup();
    const { container } = render(<Views />);
    const group = screen.getByRole('group', { name: 'দেখার ধরন' });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'কার্ড' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'তালিকা' })).toHaveAttribute('aria-pressed', 'false');
    await user.click(screen.getByRole('button', { name: 'তালিকা' }));
    expect(screen.getByText('এখন: list')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'তালিকা' })).toHaveAttribute('aria-pressed', 'true');
    await expectNoAxeViolations(container);
  });

  it('is what the language switch draws', () => {
    stubWidth(false);
    const languages = [
      { value: 'bn', label: 'বাংলা' },
      { value: 'en', label: 'English' },
    ];
    const { container: one } = render(
      <UiProvider>
        <LanguageSwitch label="ভাষা" value="bn" options={languages} onChange={() => {}} />
      </UiProvider>
    );
    const { container: two } = render(
      <UiProvider>
        <SegmentedControl label="ভাষা" value="bn" options={languages} onChange={() => {}} />
      </UiProvider>
    );
    expect(one.innerHTML).toBe(two.innerHTML);
  });
});
