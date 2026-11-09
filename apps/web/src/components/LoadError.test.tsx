import { expectNoAxeViolations } from '@/ui/testing';
import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { refreshAs, renderApp } from '../../test/auth';
import { ApiFailure, resetClientForTests } from '../lib/api';
import { LoadError } from './LoadError';

/** Sets what the browser says about its connection for one test. */
const online = (value: boolean) =>
  vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(value);

describe('LoadError', () => {
  beforeEach(() => {
    resetClientForTests();
    refreshAs(null);
  });
  afterEach(() => vi.restoreAllMocks());

  it('says something went wrong, shows the request id and tries again on a tap', async () => {
    online(true);
    const retry = vi.fn();
    const user = userEvent.setup();
    const error = new ApiFailure(500, 'server.error', 'Something went wrong', [], undefined, 'r42');
    const { container } = renderApp(<LoadError title="খসড়া" error={error} onRetry={retry} />);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('খসড়া');
    expect(alert).toHaveTextContent('কিছু একটা ভুল হয়েছে। আবার চেষ্টা করুন।');
    expect(alert).toHaveTextContent('অনুরোধ নম্বর: r42');
    await expectNoAxeViolations(container);
    await user.click(screen.getByRole('button', { name: 'আবার চেষ্টা করুন' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('says the connection is missing when the read never reached the server', async () => {
    online(false);
    renderApp(<LoadError error={new TypeError('Failed to fetch')} onRetry={() => undefined} />);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('নেট নেই। এই তথ্য দেখতে সংযোগ লাগবে।');
    expect(alert).not.toHaveTextContent('অনুরোধ নম্বর');
  });

  it('says the words of the server when the page passes them', async () => {
    online(true);
    const refused = new ApiFailure(
      409,
      'session.current',
      'This device stays signed in',
      [],
      undefined,
      'r9',
    );
    renderApp(<LoadError error={refused} message={refused.message} onRetry={() => undefined} />);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('This device stays signed in');
    expect(alert).not.toHaveTextContent('কিছু একটা ভুল হয়েছে');
    expect(alert).toHaveTextContent('অনুরোধ নম্বর: r9');
  });

  it('keeps the server error words offline when the server did answer with a refusal', async () => {
    online(false);
    const refused = new ApiFailure(403, 'permission.denied', 'Denied', [], undefined, 'r7');
    renderApp(<LoadError error={refused} onRetry={() => undefined} />);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('কিছু একটা ভুল হয়েছে। আবার চেষ্টা করুন।');
    expect(alert).toHaveTextContent('অনুরোধ নম্বর: r7');
  });
});
