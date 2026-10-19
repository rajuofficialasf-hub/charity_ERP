import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations, renderWithUi } from '../../testing/index.js';
import { DateField } from './DateField.js';

/** The day, month and year sections of a date field, in the order they are shown. */
/** The text a date field shows, without spaces and invisible marks. */
const shownText = (element: HTMLElement) =>
  (element.textContent ?? '').replace(/[\s\u200b\u2066-\u2069]/g, '');

const sections = (label: RegExp | string) =>
  within(screen.getByRole('group', { name: label })).getAllByRole('spinbutton');

describe('DateField', () => {
  it('orders the parts day, month, year with English digits and reports an ISO date', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const { container } = renderWithUi(<DateField label="বিতরণের তারিখ" onChange={onChange} />, {
      locale: 'bn',
    });
    const parts = sections(/বিতরণের তারিখ/);
    expect(parts).toHaveLength(3);
    await user.click(parts[0]!);
    await user.keyboard('11102026');
    expect(onChange).toHaveBeenLastCalledWith('2026-10-11');
    const group = screen.getByRole('group', { name: /বিতরণের তারিখ/ });
    expect(shownText(group)).toBe('11-10-2026');
    expect(group.textContent).not.toMatch(/[০-৯]/);
    expect(screen.getByRole('button', { name: /ক্যালেন্ডার খুলুন/ })).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it('shows a stored date as day-month-year', async () => {
    const { container } = renderWithUi(<DateField label="Date" value="2026-11-01" />);
    expect(shownText(screen.getByRole('group', { name: /Date/ }))).toBe('01-11-2026');
    await expectNoAxeViolations(container);
  });

  it('typing a whole date in the day part fills the month and the year', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderWithUi(<DateField label="Date" onChange={onChange} />);
    await user.click(sections(/Date/)[0]!);
    await user.keyboard('31122026');
    expect(onChange).toHaveBeenLastCalledWith('2026-12-31');
  });

  it('reports a date before the earliest allowed one and marks it invalid', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderWithUi(<DateField label="Date" min="2026-11-01" onChange={onChange} />);
    await user.click(sections(/Date/)[0]!);
    await user.keyboard('31102026');
    expect(onChange).toHaveBeenLastCalledWith('2026-10-31');
    expect(sections(/Date/)[0]).toHaveAttribute('aria-invalid', 'true');
  });

  it('marks a stored date outside the limits at once and clears it when the page replaces it', () => {
    const { rerender } = renderWithUi(
      <DateField label="Date" value="2026-10-31" min="2026-11-01" />,
    );
    expect(sections(/Date/)[0]).toHaveAttribute('aria-invalid', 'true');
    rerender(<DateField label="Date" value="2026-11-05" min="2026-11-01" />);
    expect(sections(/Date/)[0]).not.toHaveAttribute('aria-invalid');
  });

  it('opens the calendar inside the dialog the field sits in', async () => {
    const user = userEvent.setup();
    renderWithUi(
      <div role="dialog" aria-label="Box">
        <DateField label="Date" defaultValue="2026-10-11" />
      </div>,
    );
    await user.click(screen.getByRole('button', { name: /Open calendar/ }));
    const dialog = screen.getByRole('dialog', { name: 'Box' });
    expect(await within(dialog).findByRole('grid')).toBeInTheDocument();
  });

  it('shows the error the page gives and ties it to the field', () => {
    renderWithUi(<DateField label="Date" error="Pick a later date" />);
    expect(screen.getByText('Pick a later date')).toBeInTheDocument();
    expect(sections(/Date/)[0]).toHaveAttribute('aria-invalid', 'true');
  });

  it('a disabled field takes no typing and its calendar stays closed', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderWithUi(<DateField label="Date" disabled onChange={onChange} />);
    expect(screen.getByRole('button', { name: /Open calendar/ })).toBeDisabled();
    await user.click(sections(/Date/)[0]!);
    await user.keyboard('11102026');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('opens the calendar and picks a day', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderWithUi(<DateField label="Date" defaultValue="2026-10-11" onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: /Open calendar/ }));
    const grid = await screen.findByRole('grid');
    const day =
      within(grid).queryByRole('button', { name: /15/ }) ??
      within(grid).getByRole('gridcell', { name: '15' });
    await user.click(day);
    expect(onChange).toHaveBeenLastCalledWith('2026-10-15');
  });

  it('passes axe in English with a value, a helper and min and max', async () => {
    const { container } = renderWithUi(
      <DateField
        label="Date"
        defaultValue="2026-10-11"
        helper="The day of the distribution"
        min="2026-10-01"
        max="2026-12-31"
        required
      />,
    );
    await expectNoAxeViolations(container);
  });

  it('keeps the ISO date under the field name for a form', async () => {
    const user = userEvent.setup();
    const { container } = renderWithUi(<DateField label="Date" name="birth" />);
    await user.click(sections(/Date/)[0]!);
    await user.keyboard('05031990');
    expect(container.querySelector('input[name="birth"]')).toHaveValue('1990-03-05');
  });

  describe('on a phone', () => {
    const wide = window.matchMedia;
    beforeEach(() => {
      window.matchMedia = vi.fn((query: string) => ({
        matches: query.includes('max-width'),
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }));
    });
    afterEach(() => {
      window.matchMedia = wide;
    });

    it('opens the calendar as a bottom sheet that a picked day closes', async () => {
      const onChange = vi.fn();
      const user = userEvent.setup();
      renderWithUi(<DateField label="Date" defaultValue="2026-10-11" onChange={onChange} />);
      await user.click(screen.getByRole('button', { name: /Open calendar/ }));
      const sheet = await screen.findByRole('dialog', { name: 'Date' });
      expect(sheet).toHaveClass('ui-date-sheet');
      await user.click(within(sheet).getByRole('gridcell', { name: '15' }));
      expect(onChange).toHaveBeenLastCalledWith('2026-10-15');
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(shownText(screen.getByRole('group', { name: /Date/ }))).toBe('15-10-2026');
    });

    it('opens the sheet inside the dialog the field sits in', async () => {
      const user = userEvent.setup();
      renderWithUi(
        <div role="dialog" aria-label="Box">
          <DateField label="Date" defaultValue="2026-10-11" />
        </div>,
      );
      await user.click(screen.getByRole('button', { name: /Open calendar/ }));
      const sheet = await screen.findByRole('dialog', { name: 'Date' });
      expect(screen.getByRole('dialog', { name: 'Box' })).toContainElement(sheet);
    });
  });
});
