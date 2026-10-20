import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations, renderWithUi } from '../../testing/index.js';
import { Stepper } from './Stepper.js';

describe('Stepper (UX-16)', () => {
  it('lists the steps in order and marks the current one', async () => {
    const { container } = renderWithUi(
      <Stepper label="নিবন্ধনের ধাপ" steps={['পরিচয়', 'ঠিকানা', 'কাজ']} current={1} />,
      { locale: 'bn' },
    );
    const list = screen.getByRole('list', { name: 'নিবন্ধনের ধাপ' });
    const items = within(list).getAllByRole('listitem');
    expect(items.map((i) => i.textContent)).toEqual(['পরিচয়', '2ঠিকানা', '3কাজ']);
    expect(items[1]).toHaveAttribute('aria-current', 'step');
    expect(items[0]).not.toHaveAttribute('aria-current');
    await expectNoAxeViolations(container);
  });

  it('opens a step when pressed and names a step with something missing (UX-20)', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    const { container } = renderWithUi(
      <Stepper
        label="সেটআপের ধাপ"
        steps={['মৌলিক তথ্য', 'বাজেট', 'পর্যালোচনা']}
        current={0}
        marks={['complete', 'missing', undefined]}
        missingLabel="বাকি আছে"
        onSelect={onSelect}
      />,
      { locale: 'bn' },
    );
    const list = screen.getByRole('list', { name: 'সেটআপের ধাপ' });
    const budget = within(list).getByRole('button', { name: 'বাজেট, বাকি আছে' });
    await user.click(budget);
    expect(onSelect).toHaveBeenCalledWith(1);
    await user.keyboard('{Shift>}{Tab}{/Shift}');
    await user.keyboard('{Enter}');
    expect(onSelect).toHaveBeenLastCalledWith(0);
    expect(within(list).getAllByRole('listitem')[1]).toHaveClass('has-missing');
    await expectNoAxeViolations(container);
  });
});
