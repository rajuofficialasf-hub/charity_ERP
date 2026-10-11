import { expectNoAxeViolations } from '@css/ui/testing';
import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ME, refreshAs, renderApp } from '../test/auth';
import { resetClientForTests } from './_lib/api';
import { HomeView } from './HomeView';
import HomePage from './page';

const replace = vi.fn();
const redirect = vi.fn((_path: string) => {
  throw new Error('NEXT_REDIRECT');
});
let hasCsrf = false;
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, refresh: vi.fn() }),
  redirect: (path: string) => redirect(path),
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({ has: (name: string) => name === 'css_csrf' && hasCsrf }),
}));

beforeEach(() => {
  resetClientForTests();
  replace.mockClear();
});

describe('HomePage', () => {
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

  it('redirects on the server when the device has no session cookie', async () => {
    hasCsrf = false;
    await expect(HomePage()).rejects.toThrow('NEXT_REDIRECT');
    expect(redirect).toHaveBeenCalledWith('/login');
    hasCsrf = true;
    redirect.mockClear();
    await HomePage();
    expect(redirect).not.toHaveBeenCalled();
  });

  it('sends a signed-out visitor to the login screen', async () => {
    refreshAs(null);
    renderApp(<HomeView />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/login'));
  });
});
