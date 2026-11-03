// @vitest-environment jsdom
// The choice pieces this app added to the asf template (listed in local.json): checkboxes, radios,
// the switch, the select with search and "other", and the combobox.
import '@testing-library/jest-dom/vitest';

import type { UiLabels, ChoiceOption } from '@/ui/contract';

import { useState } from 'react';
import userEvent from '@testing-library/user-event';
import { vi, it, expect, describe, afterEach, beforeEach } from 'vitest';
import { render, screen, within, cleanup } from '@testing-library/react';

import { resetPage, stubWidth, expectNoAxeViolations } from './local-test-support';
import { Switch, Checkbox, Combobox, RadioGroup, UiProvider, SelectField, CheckboxGroup } from './index';

beforeEach(() => stubWidth(false));

afterEach(() => {
  cleanup();
  resetPage();
});

const kinds: ChoiceOption[] = [
  { value: 'elderly', label: 'Elderly' },
  { value: 'widow', label: 'Widow' },
  { value: 'orphan', label: 'Orphan', disabled: true },
  { value: 'other', label: 'Other' },
];

describe('the checkbox', () => {
  it('is named by its label, toggles, and shows a mixed state', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(
      <UiProvider>
        <Checkbox label="I agree to the rules" checked={false} onChange={onChange} hint="Read them first" />
      </UiProvider>
    );
    await user.click(screen.getByRole('checkbox', { name: 'I agree to the rules' }));
    expect(onChange).toHaveBeenLastCalledWith(true);
    expect(screen.getByText('Read them first')).toBeInTheDocument();
    rerender(
      <UiProvider>
        <Checkbox ariaLabel="Select all" checked={false} indeterminate onChange={onChange} />
      </UiProvider>
    );
    expect(screen.getByRole('checkbox', { name: 'Select all' })).toHaveAttribute('data-indeterminate', 'true');
  });

  it('does nothing while disabled', async () => {
    // a disabled control takes no pointer events, so the click is let through to prove it is ignored
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const onChange = vi.fn();
    render(
      <UiProvider>
        <Checkbox label="Locked choice" checked onChange={onChange} disabled />
      </UiProvider>
    );
    await user.click(screen.getByRole('checkbox', { name: 'Locked choice' }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('checkbox', { name: 'Locked choice' })).toBeDisabled();
  });
});

describe('the checkbox group', () => {
  function Kinds({ error }: { error?: string }) {
    const [value, setValue] = useState<string[]>(['widow']);
    const [text, setText] = useState('');
    return (
      <UiProvider>
        <CheckboxGroup
          label="Beneficiary type"
          options={kinds}
          value={value}
          onChange={setValue}
          error={error}
          required
          other={{ value: 'other', text, onTextChange: setText }}
        />
        <output>{`${value.join(',')}|${text}`}</output>
      </UiProvider>
    );
  }

  it('is a group named by its label that adds and removes values', async () => {
    const user = userEvent.setup();
    render(<Kinds />);
    const group = screen.getByRole('group', { name: /Beneficiary type/ });
    await user.click(within(group).getByRole('checkbox', { name: 'Elderly' }));
    await user.click(within(group).getByRole('checkbox', { name: 'Widow' }));
    expect(screen.getByRole('status')).toHaveTextContent('elderly|');
    expect(within(group).getByRole('checkbox', { name: 'Orphan' })).toBeDisabled();
  });

  it('opens a text box for "other" inside the same field', async () => {
    const user = userEvent.setup();
    render(<Kinds />);
    expect(screen.queryByRole('textbox', { name: 'If other, please specify' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'Other' }));
    await user.type(screen.getByRole('textbox', { name: 'If other, please specify' }), 'Day labourer');
    expect(screen.getByRole('status')).toHaveTextContent('widow,other|Day labourer');
  });

  it('shows its error and marks the group invalid', () => {
    render(<Kinds error="Choose at least one" />);
    expect(screen.getByText('Choose at least one')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /Beneficiary type/ })).toHaveAttribute('aria-invalid', 'true');
  });
});

describe('the radio group', () => {
  function Gender() {
    const [value, setValue] = useState<string | null>(null);
    const [text, setText] = useState('');
    return (
      <UiProvider>
        <RadioGroup
          label="Beneficiary type"
          options={kinds}
          value={value}
          onChange={setValue}
          orientation="horizontal"
          other={{ value: 'other', text, onTextChange: setText, label: 'Which type?' }}
        />
        <output>{`${value ?? ''}|${text}`}</output>
      </UiProvider>
    );
  }

  it('selects one option and opens the "other" text with its own label', async () => {
    const user = userEvent.setup();
    render(<Gender />);
    const group = screen.getByRole('radiogroup', { name: 'Beneficiary type' });
    await user.click(within(group).getByRole('radio', { name: 'Widow' }));
    expect(screen.getByRole('status')).toHaveTextContent('widow|');
    await user.click(within(group).getByRole('radio', { name: 'Other' }));
    expect(within(group).getByRole('radio', { name: 'Widow' })).not.toBeChecked();
    await user.type(screen.getByRole('textbox', { name: 'Which type?' }), 'Farmer');
    expect(screen.getByRole('status')).toHaveTextContent('other|Farmer');
  });
});

describe('the switch', () => {
  it('is a switch named by its label that applies at once', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <UiProvider>
        <Switch label="Email notices" checked={false} onChange={onChange} />
        <Switch ariaLabel="Public link" checked onChange={() => {}} disabled />
      </UiProvider>
    );
    await user.click(screen.getByRole('switch', { name: 'Email notices' }));
    expect(onChange).toHaveBeenLastCalledWith(true);
    expect(screen.getByRole('switch', { name: 'Public link' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Public link' })).toBeDisabled();
  });
});

describe('the select', () => {
  it('shows its placeholder and opens the "other" text box', async () => {
    const user = userEvent.setup();
    function Kind() {
      const [value, setValue] = useState('');
      const [text, setText] = useState('');
      return (
        <UiProvider>
          <SelectField label="Type" options={kinds} value={value} onChange={setValue} placeholder="Choose a type" other={{ value: 'other', text, onTextChange: setText }} />
          <output>{`${value}|${text}`}</output>
        </UiProvider>
      );
    }
    render(<Kind />);
    expect(screen.getByRole('combobox', { name: 'Type' })).toHaveTextContent('Choose a type');
    await user.click(screen.getByRole('combobox', { name: 'Type' }));
    expect(screen.getByRole('option', { name: 'Orphan' })).toHaveAttribute('aria-disabled', 'true');
    await user.click(screen.getByRole('option', { name: 'Other' }));
    await user.type(screen.getByRole('textbox', { name: 'If other, please specify' }), 'Day labourer');
    expect(screen.getByRole('status')).toHaveTextContent('other|Day labourer');
  });

  it('becomes searchable above 10 options', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const districts = Array.from({ length: 12 }, (_, i) => ({ value: `d${i}`, label: `District ${i + 1}` }));
    render(
      <UiProvider>
        <SelectField label="District" options={districts} value="" onChange={onChange} />
      </UiProvider>
    );
    await user.type(screen.getByRole('combobox', { name: 'District' }), '12');
    const list = screen.getByRole('listbox');
    expect(within(list).getAllByRole('option')).toHaveLength(1);
    await user.click(within(list).getByRole('option', { name: 'District 12' }));
    expect(onChange).toHaveBeenLastCalledWith('d11');
  });
});

describe('the combobox', () => {
  const unions: ChoiceOption[] = [
    { value: 'u1', label: 'Mirpur' },
    { value: 'u2', label: 'Mohammadpur' },
    { value: 'u3', label: 'Savar' },
  ];

  it('narrows the list as one types and reports the chosen value', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <UiProvider>
        <Combobox label="Union" options={unions} value={null} onChange={onChange} />
      </UiProvider>
    );
    await user.type(screen.getByRole('combobox', { name: 'Union' }), 'mo');
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['Mohammadpur']);
    await user.keyboard('{ArrowDown}{Enter}');
    expect(onChange).toHaveBeenLastCalledWith('u2');
  });

  it('says when nothing matches, and empties by its clear button', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <UiProvider>
        <Combobox label="Union" options={unions} value="u3" onChange={onChange} />
      </UiProvider>
    );
    // the clear button shows once the field has focus
    await user.click(screen.getByRole('combobox', { name: 'Union' }));
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(onChange).toHaveBeenLastCalledWith(null);
    await user.type(screen.getByRole('combobox', { name: 'Union' }), 'zzz');
    expect(screen.getByText('No results')).toBeInTheDocument();
  });

  it('hands the typed text to a server search and shows its answer unfiltered', async () => {
    const user = userEvent.setup();
    const onInputChange = vi.fn();
    render(
      <UiProvider>
        <Combobox label="Volunteer" options={unions} value={null} onChange={() => {}} onInputChange={onInputChange} serverSearch />
      </UiProvider>
    );
    await user.type(screen.getByRole('combobox', { name: 'Volunteer' }), 'xy');
    expect(onInputChange).toHaveBeenLastCalledWith('xy');
    expect(screen.getAllByRole('option')).toHaveLength(3);
  });
});

describe('the choices together', () => {
  it.each([
    ['en', 'light', undefined],
    ['bn', 'dark', { otherSpecify: 'অন্যান্য হলে লিখুন', clear: 'মুছুন', showOptions: 'বিকল্পগুলো দেখুন' }],
  ] as const)('pass axe in %s, %s', async (_, mode, labels: Partial<UiLabels> | undefined) => {
    window.localStorage.setItem('asf-mode', mode);
    const { container } = render(
      <UiProvider labels={labels}>
        <Checkbox label="I agree" checked onChange={() => {}} />
        <CheckboxGroup label="Types" options={kinds} value={['other']} onChange={() => {}} other={{ value: 'other', text: 'x', onTextChange: () => {} }} error="Check this" />
        <RadioGroup label="Gender" options={kinds} value="widow" onChange={() => {}} />
        <Switch label="Email notices" checked onChange={() => {}} />
        <SelectField label="Type" options={kinds} value="" onChange={() => {}} placeholder="Choose" />
        <Combobox label="Union" options={kinds} value="widow" onChange={() => {}} />
      </UiProvider>
    );
    await expectNoAxeViolations(container);
  });
});

describe('the combobox with a server search', () => {
  it('keeps showing the chosen option while the next answer does not hold it', async () => {
    const user = userEvent.setup();
    function Search() {
      const [value, setValue] = useState<string | null>(null);
      const [options, setOptions] = useState<ChoiceOption[]>([{ value: 'u2', label: 'Mohammadpur' }]);
      return (
        <UiProvider>
          <Combobox
            label="Union"
            options={options}
            value={value}
            serverSearch
            onChange={(next) => {
              setValue(next);
              // the next server answer no longer holds the chosen option
              setOptions([]);
            }}
          />
        </UiProvider>
      );
    }
    render(<Search />);
    await user.click(screen.getByRole('combobox', { name: 'Union' }));
    await user.click(screen.getByRole('option', { name: 'Mohammadpur' }));
    // leaving the field would empty a text that no chosen option backs
    await user.tab();
    expect(screen.getByRole('combobox', { name: 'Union' })).toHaveValue('Mohammadpur');
  });

  it('names a saved value that is not among the options yet', () => {
    render(
      <UiProvider>
        <Combobox label="Union" options={[]} value="u9" valueLabel="Savar" onChange={() => {}} />
      </UiProvider>
    );
    expect(screen.getByRole('combobox', { name: 'Union' })).toHaveValue('Savar');
  });

  it('hands over free text as the value', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <UiProvider>
        <Combobox label="Village" options={[{ value: 'v1', label: 'Uttarpara' }]} value={null} onChange={onChange} freeText />
      </UiProvider>
    );
    await user.type(screen.getByRole('combobox', { name: 'Village' }), 'Dakshinpara{Enter}');
    expect(onChange).toHaveBeenLastCalledWith('Dakshinpara');
  });
});

describe('the combobox while the server answers', () => {
  it('says it is loading in its open list', async () => {
    const user = userEvent.setup();
    render(
      <UiProvider>
        <Combobox label="Volunteer" options={[]} value={null} onChange={() => {}} serverSearch loading />
      </UiProvider>
    );
    await user.click(screen.getByRole('combobox', { name: 'Volunteer' }));
    expect(screen.getByText('Loading')).toBeInTheDocument();
  });
});
