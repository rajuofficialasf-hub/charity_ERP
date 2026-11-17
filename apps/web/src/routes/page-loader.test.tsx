import { act, fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../test/auth';
import { page } from './page-loader';

// A route page whose chunk failed to load (offline) loads again once the network returns, or from
// its button, without a reload (React Router keeps what a route's lazy answered).
const Loaded = () => <p>লোড হওয়া পাতা</p>;

describe('the lazy page of a route', () => {
  it('answers the page itself when its module loads', async () => {
    const lazy = page(() => Promise.resolve({ Loaded }), 'Loaded');
    const { Component } = await lazy();
    renderApp(<Component />);
    expect(await screen.findByText('লোড হওয়া পাতা')).toBeInTheDocument();
  });

  it('loads again when the network returns, after a failed load', async () => {
    const load = vi
      .fn<() => Promise<{ Loaded: typeof Loaded }>>()
      .mockRejectedValueOnce(new TypeError('Failed to fetch dynamically imported module'))
      .mockResolvedValue({ Loaded });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const lazy = page(load, 'Loaded');
    const { Component } = await lazy();
    renderApp(<Component />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText('লোড হওয়া পাতা')).not.toBeInTheDocument();
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });
    expect(await screen.findByText('লোড হওয়া পাতা')).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('reloads the page when a new attempt fails with the network back', async () => {
    const load = vi
      .fn<() => Promise<{ Loaded: typeof Loaded }>>()
      .mockRejectedValue(new TypeError('Failed to fetch dynamically imported module'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const reload = vi.fn();
    const location = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...location, reload },
    });
    try {
      const { Component } = await page(load, 'Loaded')();
      renderApp(<Component />);
      fireEvent.click(await screen.findByRole('button', { name: 'আবার চেষ্টা করুন' }));
      await vi.waitFor(() => expect(reload).toHaveBeenCalledOnce());
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: location });
    }
  });

  it('loads again from its button, and a later visit finds the page loaded', async () => {
    const load = vi
      .fn<() => Promise<{ Loaded: typeof Loaded }>>()
      .mockRejectedValueOnce(new TypeError('Failed to fetch dynamically imported module'))
      .mockResolvedValue({ Loaded });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { Component } = await page(load, 'Loaded')();
    const first = renderApp(<Component />);
    fireEvent.click(await screen.findByRole('button', { name: 'আবার চেষ্টা করুন' }));
    expect(await screen.findByText('লোড হওয়া পাতা')).toBeInTheDocument();
    first.unmount();
    // the route keeps the same answer: the next visit shows the page at once
    renderApp(<Component />);
    expect(screen.getByText('লোড হওয়া পাতা')).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(2);
  });
});
