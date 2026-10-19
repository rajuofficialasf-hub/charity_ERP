import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations, renderWithUi } from '../../testing/index.js';
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

  it('shows server-searched options as they arrive, without filtering them again', async () => {
    const user = userEvent.setup();
    function Search() {
      const [options, setOptions] = useState<SelectOption[]>([]);
      return (
        <Combobox
          label="User"
          options={options}
          serverSearch
          onInputChange={(text) =>
            setTimeout(() => setOptions(text ? [{ id: 'u1', label: 'Rahim' }] : []), 10)
          }
        />
      );
    }
    renderWithUi(<Search />);
    await user.click(screen.getByRole('combobox', { name: 'User' }));
    await user.paste('rahim@example.org');
    // the label does not contain the typed email; the server matched it
    expect(await screen.findByRole('option', { name: 'Rahim' })).toBeVisible();
  });
});
