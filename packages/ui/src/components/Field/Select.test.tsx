import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations, renderWithUi } from '../../testing/index.js';
import { DateField } from './DateField.js';
import { Combobox, Select, type SelectOption } from './Select.js';

const types: SelectOption[] = [
  { id: 'elderly', label: 'বৃদ্ধ' },
  { id: 'widow', label: 'বিধবা' },
  { id: 'orphan', label: 'এতিম' },
  { id: 'other', label: 'অন্যান্য' },
];
const districts: SelectOption[] = [
  'Dhaka',
  'Gazipur',
  'Narayanganj',
  'Narsingdi',
  'Manikganj',
  'Munshiganj',
  'Rangpur',
  'Dinajpur',
  'Nilphamari',
  'Kurigram',
  'Lalmonirhat',
].map((name) => ({ id: name.toLowerCase(), label: name }));

describe('Select (DESIGN_SYSTEM 5.4)', () => {
  it('opens with the keyboard and selects an option', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const { container } = renderWithUi(
      <Select label="উপকারভোগীর ধরন" options={types} onChange={onChange} required />,
      { locale: 'bn' },
    );
    const trigger = screen.getByRole('button', { name: /উপকারভোগীর ধরন/ });
    expect(trigger).toHaveTextContent('বেছে নিন');
    await expectNoAxeViolations(container);
    trigger.focus();
    await user.keyboard('{ArrowDown}');
    const listbox = await screen.findByRole('listbox');
    await user.click(within(listbox).getByRole('option', { name: 'বিধবা' }));
    expect(onChange).toHaveBeenLastCalledWith('widow');
    expect(trigger).toHaveTextContent('বিধবা');
  });

  it('opens a text box in the same field for the "other" option (BD-14)', async () => {
    const onOther = vi.fn();
    const user = userEvent.setup();
    renderWithUi(
      <Select
        label="Type"
        options={types}
        defaultValue="elderly"
        otherOptionId="other"
        onOtherChange={onOther}
      />,
    );
    expect(screen.queryByRole('textbox', { name: 'If other, please specify' })).toBeNull();
    await user.click(screen.getByRole('button', { name: /Type/ }));
    await user.click(await screen.findByRole('option', { name: 'অন্যান্য' }));
    await user.type(screen.getByRole('textbox', { name: 'If other, please specify' }), 'ভিক্ষুক');
    expect(onOther).toHaveBeenLastCalledWith('ভিক্ষুক');
  });

  it('adds a search box when there are more than 10 options', async () => {
    const user = userEvent.setup();
    renderWithUi(<Select label="District" options={districts} />);
    await user.click(screen.getByRole('button', { name: /District/ }));
    const search = await screen.findByRole('searchbox', { name: 'Search' });
    await user.type(search, 'pur');
    const names = within(screen.getByRole('listbox'))
      .getAllByRole('option')
      .map((o) => o.textContent);
    expect(names).toEqual(['Gazipur', 'Rangpur', 'Dinajpur']);
  });
});

describe('Combobox (DESIGN_SYSTEM 5.4)', () => {
  it('filters as the user types and selects with the keyboard', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const { container } = renderWithUi(
      <Combobox label="Upazila" options={districts} onChange={onChange} />,
    );
    const input = screen.getByRole('combobox', { name: 'Upazila' });
    await expectNoAxeViolations(container);
    await user.type(input, 'nil');
    const options = within(await screen.findByRole('listbox')).getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual(['Nilphamari']);
    await user.keyboard('{ArrowDown}{Enter}');
    expect(onChange).toHaveBeenLastCalledWith('nilphamari');
    expect(input).toHaveValue('Nilphamari');
  });
});

describe('DateField (O-55)', () => {
  it('orders segments day, month, year with English digits and reports an ISO date', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const { container } = renderWithUi(<DateField label="বিতরণের তারিখ" onChange={onChange} />, {
      locale: 'bn',
    });
    const segments = screen.getAllByRole('spinbutton');
    expect(segments).toHaveLength(3);
    expect(container.querySelectorAll('.ui-date-literal')[0]).toHaveTextContent('-');
    await user.click(segments[0]!);
    await user.keyboard('11102026');
    expect(onChange).toHaveBeenLastCalledWith('2026-10-11');
    expect(container.querySelector('.ui-date-input')).toHaveTextContent('11-10-2026');
    expect(container.querySelector('.ui-date-input')?.textContent).not.toMatch(/[০-৯]/);
    expect(screen.getByRole('button', { name: /ক্যালেন্ডার খুলুন/ })).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it('opens the calendar and picks a day', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderWithUi(<DateField label="Date" defaultValue="2026-10-11" onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: /Open calendar/ }));
    const grid = await screen.findByRole('grid');
    await user.click(within(grid).getByRole('button', { name: /15/ }));
    expect(onChange).toHaveBeenLastCalledWith('2026-10-15');
  });
});
