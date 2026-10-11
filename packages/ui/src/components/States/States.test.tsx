import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations, renderWithUi } from '../../testing/index.js';
import { Button } from '../Button/Button.js';
import { Skeleton } from '../Skeleton/Skeleton.js';
import { EmptyState, ErrorState } from './States.js';

describe('Empty / Loading / Error states (DESIGN_SYSTEM 5.15, 8)', () => {
  it('empty state: heading, one sentence and one action', async () => {
    const { container } = renderWithUi(
      <EmptyState
        title="এখনও কোনো আবেদন নেই"
        message="প্রথম আবেদনটি তৈরি করুন।"
        action={<Button>নতুন আবেদন</Button>}
      />,
      { locale: 'bn' },
    );
    expect(screen.getByRole('heading', { name: 'এখনও কোনো আবেদন নেই' })).toBeInTheDocument();
    expect(container.querySelector('.ui-empty-art')).toHaveAttribute('aria-hidden', 'true');
    await expectNoAxeViolations(container);
  });

  it('error state: retry and the request id for support', async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();
    const { container } = renderWithUi(
      <ErrorState
        title="Could not load"
        message="Check the connection."
        requestId="req-7f3a"
        onRetry={onRetry}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledOnce();
    expect(screen.getByText('Request id: req-7f3a')).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it('skeleton announces loading once and hides its blocks', async () => {
    const { container } = renderWithUi(<Skeleton shape="row" count={4} />, { locale: 'bn' });
    expect(screen.getByRole('status')).toHaveTextContent('লোড হচ্ছে');
    expect(container.querySelectorAll('.ui-skeleton-item[aria-hidden="true"]')).toHaveLength(4);
    await expectNoAxeViolations(container);
  });
});
