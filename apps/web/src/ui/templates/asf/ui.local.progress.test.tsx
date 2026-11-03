// @vitest-environment jsdom
// The progress pieces this app added to the asf template (listed in local.json): the stepper, the
// timeline, the progress bar and the loading skeleton.
import '@testing-library/jest-dom/vitest';

import userEvent from '@testing-library/user-event';
import { vi, it, expect, describe, afterEach, beforeEach } from 'vitest';
import { render, screen, within, cleanup } from '@testing-library/react';

import { Stepper, Timeline, Skeleton, UiProvider, ProgressBar } from './index';
import { resetPage, stubWidth, expectNoAxeViolations } from './local-test-support';

beforeEach(() => stubWidth(false));

afterEach(() => {
  cleanup();
  resetPage();
});

const steps = ['Contact', 'Identity', 'Address', 'Photos'];

describe('the stepper', () => {
  it('is a named list with the current step marked', () => {
    render(
      <UiProvider>
        <Stepper label="Registration steps" steps={steps} current={2} />
      </UiProvider>
    );
    const items = within(screen.getByRole('list', { name: 'Registration steps' })).getAllByRole('listitem');
    expect(items).toHaveLength(4);
    expect(items[2]).toHaveAttribute('aria-current', 'step');
    expect(items[0]).toHaveTextContent('Contact');
    expect(items[0]).toHaveAttribute('data-state', 'done');
    expect(items[3]).toHaveAttribute('data-state', 'upcoming');
  });

  it('reads a step that still needs something, and opens a step by its button', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <UiProvider>
        <Stepper label="Setup" steps={steps} current={0} marks={['complete', 'missing', undefined, 'complete']} onSelect={onSelect} />
      </UiProvider>
    );
    expect(screen.getByRole('button', { name: 'Identity, still needed' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Photos' }));
    expect(onSelect).toHaveBeenCalledWith(3);
  });
});

describe('the timeline', () => {
  const history = [
    { id: '1', title: 'Submitted', actor: 'Rahim Uddin', time: '1 Nov 2026, 10:00', status: 'done' as const },
    { id: '2', title: 'Under review', actor: 'Salma Begum', time: '2 Nov 2026, 09:30', status: 'current' as const, comment: 'Checking the house photos' },
    { id: '3', title: 'Approved', status: 'upcoming' as const },
  ];

  it('reads each step with its state, and shows who acted only when asked', () => {
    const { rerender } = render(
      <UiProvider>
        <Timeline label="Application history" steps={history} />
      </UiProvider>
    );
    const items = within(screen.getByRole('list', { name: 'Application history' })).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Submitted, Done');
    expect(items[1]).toHaveAttribute('aria-current', 'step');
    expect(items[1]).toHaveTextContent('Checking the house photos');
    expect(screen.queryByText(/Rahim Uddin/)).not.toBeInTheDocument();
    expect(screen.getByText('1 Nov 2026, 10:00')).toBeInTheDocument();
    rerender(
      <UiProvider>
        <Timeline label="Application history" steps={history} showActor />
      </UiProvider>
    );
    expect(screen.getByText(/Rahim Uddin/)).toBeInTheDocument();
  });

  it('draws the stages as a strip', () => {
    render(
      <UiProvider>
        <Timeline label="Stages" steps={history} orientation="horizontal" />
      </UiProvider>
    );
    const items = within(screen.getByRole('list', { name: 'Stages' })).getAllByRole('listitem');
    expect(items[2]).toHaveTextContent('Approved, Upcoming');
  });
});

describe('the progress bar', () => {
  it('is a progress bar named by its label, with the numbers written out', () => {
    render(
      <UiProvider>
        <ProgressBar label="Budget used" value={1240} max={2000} />
      </UiProvider>
    );
    const bar = screen.getByRole('progressbar', { name: 'Budget used' });
    expect(bar).toHaveAttribute('aria-valuenow', '1240');
    expect(bar).toHaveAttribute('aria-valuetext', '1,240 of 2,000 (62%)');
    expect(screen.getByText('1,240 of 2,000 (62%)')).toBeInTheDocument();
  });

  it('keeps an overrun inside the bar but tells the true figure', () => {
    render(
      <UiProvider>
        <ProgressBar label="Quota" value={130} max={100} tone="error" />
      </UiProvider>
    );
    const bar = screen.getByRole('progressbar', { name: 'Quota' });
    expect(bar).toHaveAttribute('aria-valuenow', '100');
    expect(bar).toHaveAttribute('aria-valuetext', '130 of 100 (130%)');
  });

  it('writes a legend for stacked parts', () => {
    render(
      <UiProvider>
        <ProgressBar
          label="Budget"
          value={900}
          max={2000}
          segments={[
            { label: 'Spent', value: 600 },
            { label: 'Advance', value: 300 },
          ]}
        />
      </UiProvider>
    );
    const legend = screen.getByRole('list');
    expect(within(legend).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['Spent 600', 'Advance 300']);
  });
});

describe('the skeleton', () => {
  it('says it is loading and hides its shapes', () => {
    render(
      <UiProvider>
        <Skeleton shape="row" count={3} />
      </UiProvider>
    );
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Loading');
    expect(status.querySelectorAll('[aria-hidden="true"]')).toHaveLength(3);
  });
});

describe('the progress pieces together', () => {
  it.each(['light', 'dark'] as const)('pass axe, %s', async (mode) => {
    window.localStorage.setItem('asf-mode', mode);
    const { container } = render(
      <UiProvider>
        <Stepper label="Steps" steps={steps} current={1} onSelect={() => {}} />
        <Timeline label="History" steps={[{ id: '1', title: 'Submitted', status: 'done' }]} />
        <ProgressBar label="Budget" value={10} max={20} />
        <Skeleton shape="card" />
      </UiProvider>
    );
    await expectNoAxeViolations(container);
  });
});
