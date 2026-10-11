import { expectNoAxeViolations } from '@css/ui/testing';
import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { ME, refreshAs, renderApp } from '../../../test/auth';
import { resetClientForTests } from '../../lib/api';
import { HomeView } from './HomeView';

beforeEach(() => {
  resetClientForTests();
});

describe('HomeView', () => {
  it('welcomes a signed-in user with account links, without accessibility violations', async () => {
    refreshAs(ME);
    const { container } = renderApp(<HomeView />);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'স্বাগতম, নমুনা কর্মকর্তা' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'আমার ডিভাইস' })).toHaveAttribute(
      'href',
      '/account/sessions',
    );
    expect(screen.getByRole('button', { name: 'লগআউট' })).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it('tells a pending user that the registration waits for approval (AUTH.md 7)', async () => {
    refreshAs({ ...ME, state: 'pending' });
    renderApp(<HomeView />, 'en');
    expect(
      await screen.findByText(/Your registration is waiting for approval/),
    ).toBeInTheDocument();
  });

  it('sends a signed-out visitor to the login screen', async () => {
    refreshAs(null);
    const { router } = renderApp(<HomeView />);
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
  });
});
