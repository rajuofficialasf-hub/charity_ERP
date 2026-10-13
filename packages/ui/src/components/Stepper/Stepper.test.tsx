import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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
});
