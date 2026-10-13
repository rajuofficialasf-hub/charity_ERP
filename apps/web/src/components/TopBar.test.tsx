import { expectNoAxeViolations } from '@css/ui/testing';
import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { refreshAs, renderApp } from '../../test/auth';
import { resetClientForTests } from '../lib/api';
import { TopBar } from './TopBar';

describe('TopBar (UX-19)', () => {
  beforeEach(() => {
    resetClientForTests();
    refreshAs(null);
  });

  it('shows the system name at the start and the language toggle at the end', async () => {
    const { container } = renderApp(<TopBar />, 'en');
    const bar = screen.getByRole('banner');
    expect(bar.firstElementChild).toHaveAttribute('href', '/');
    expect(within(bar).getByRole('radiogroup', { name: 'Language' })).toBe(bar.lastElementChild);
    await expectNoAxeViolations(container);
  });

  it('can leave the name out when the page shows it itself', () => {
    renderApp(<TopBar showBrand={false} />, 'en');
    const bar = screen.getByRole('banner');
    expect(within(bar).queryByRole('link')).not.toBeInTheDocument();
    expect(within(bar).getByRole('radiogroup', { name: 'Language' })).toBeInTheDocument();
  });
});
