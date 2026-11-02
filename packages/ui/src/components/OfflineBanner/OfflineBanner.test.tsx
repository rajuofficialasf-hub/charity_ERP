import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations, renderWithUi } from '../../testing/index.js';
import { OfflineBanner } from './OfflineBanner.js';

describe('Offline banner (DESIGN_SYSTEM 5.16)', () => {
  it('announces the state but not the pending count, and opens the outbox', async () => {
    const onOpen = vi.fn();
    const user = userEvent.setup();
    const { container, rerender } = renderWithUi(
      <OfflineBanner state="offline" pendingCount={3} onOpenOutbox={onOpen} />,
      { locale: 'bn' },
    );
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('আপনি অফলাইনে আছেন');
    // the whole banner is one landmark, so nothing in it stands outside the page's regions
    expect(screen.getByRole('complementary', { name: 'সংযোগ ও সিঙ্কের অবস্থা' })).toContainElement(
      status,
    );
    expect(status).not.toHaveTextContent('3');
    expect(screen.getByText('3টি সিঙ্কের অপেক্ষায়')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'বিস্তারিত দেখুন' }));
    expect(onOpen).toHaveBeenCalledOnce();
    await expectNoAxeViolations(container);
    rerender(<OfflineBanner state="sync_failed" pendingCount={3} />);
    expect(screen.getByRole('status')).toHaveTextContent('সিঙ্ক হয়নি');
  });

  it('says the words it is given in place of the state’s own', () => {
    renderWithUi(<OfflineBanner state="offline" text="নেট লাগবে" />, { locale: 'bn' });
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('নেট লাগবে');
    expect(status).not.toHaveTextContent('সংরক্ষিত');
  });

  it('takes a name of its own, so several banners on one page stay apart', async () => {
    const { container } = renderWithUi(
      <>
        <OfflineBanner state="offline" label="Offline example" />
        <OfflineBanner state="syncing" label="Syncing example" />
      </>,
    );
    expect(screen.getByRole('complementary', { name: 'Offline example' })).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Syncing example' })).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it('hides "back online" after 4 seconds', () => {
    vi.useFakeTimers();
    const onHidden = vi.fn();
    renderWithUi(<OfflineBanner state="back_online" onHidden={onHidden} />);
    expect(screen.getByRole('status')).toHaveTextContent('Back online');
    act(() => vi.advanceTimersByTime(4000));
    expect(screen.queryByRole('status')).toBeNull();
    expect(onHidden).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });
});
