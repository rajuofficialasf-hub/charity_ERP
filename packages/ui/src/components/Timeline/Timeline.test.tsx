import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations, renderWithUi } from '../../testing/index.js';
import { ProgressBar } from '../ProgressBar/ProgressBar.js';
import { Timeline, type TimelineStep } from './Timeline.js';

const steps: TimelineStep[] = [
  { id: 's', title: 'জমা', actor: 'রহিম', time: '02-10-2026 10:30 AM', status: 'done' },
  { id: 'r', title: 'পর্যালোচনা', actor: 'করিম', time: '05-10-2026', status: 'current' },
  { id: 'a', title: 'অনুমোদন', status: 'upcoming' },
];

describe('Step / timeline (DESIGN_SYSTEM 5.18)', () => {
  it('is an ordered list with the current step marked and states spelled out', async () => {
    const { container } = renderWithUi(<Timeline steps={steps} label="ইতিহাস" showActor />, {
      locale: 'bn',
    });
    const list = screen.getByRole('list', { name: 'ইতিহাস' });
    expect(list.tagName).toBe('OL');
    const items = within(list).getAllByRole('listitem');
    expect(items[1]).toHaveAttribute('aria-current', 'step');
    expect(items[0]).toHaveTextContent('জমা, সম্পন্ন');
    expect(items[0]).toHaveTextContent('রহিম · 02-10-2026 10:30 AM');
    await expectNoAxeViolations(container);
  });

  it('hides actor names unless showActor is set, and has a horizontal strip', async () => {
    const { container } = renderWithUi(
      <Timeline steps={steps} label="stages" orientation="horizontal" />,
    );
    expect(container).not.toHaveTextContent('রহিম');
    expect(container.querySelector('.ui-steps-h .is-current')).toHaveAttribute(
      'aria-current',
      'step',
    );
    await expectNoAxeViolations(container);
  });
});

describe('Progress bar (DESIGN_SYSTEM 5.19)', () => {
  it('has role progressbar with value text and visible numbers', async () => {
    const { container } = renderWithUi(
      <ProgressBar label="Budget used" value={750} max={1000} tone="warning" />,
    );
    const bar = screen.getByRole('progressbar', { name: 'Budget used' });
    expect(bar).toHaveAttribute('aria-valuemax', '1000');
    expect(bar).toHaveAttribute('aria-valuetext', '750 of 1,000 (75%)');
    expect(screen.getByText('750 of 1,000 (75%)')).toBeVisible();
    expect(container.querySelector('.ui-progress.t-warning')).not.toBeNull();
    await expectNoAxeViolations(container);
  });

  it('stacks up to four segments with a text legend', () => {
    const { container } = renderWithUi(
      <ProgressBar
        label="Budget"
        value={900}
        max={1000}
        segments={[
          { label: 'spent', value: 500 },
          { label: 'advance', value: 300 },
          { label: 'returned', value: 50 },
          { label: 'claimed', value: 50 },
          { label: 'extra', value: 1 },
        ]}
      />,
    );
    expect(container.querySelectorAll('.ui-progress > span')).toHaveLength(4);
    expect(screen.getByText('spent').closest('li')).toHaveTextContent('spent 500');
  });
});
