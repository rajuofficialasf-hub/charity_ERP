// @vitest-environment jsdom
// The text field kinds and states this app added to the asf template (listed in local.json), the
// error summary, the form section, and the text and select fields of the extended set bound to a
// form.
import '@testing-library/jest-dom/vitest';

import type { TextFieldExtendedProps } from '@/ui/contract';

import { z } from 'zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import userEvent from '@testing-library/user-event';
import { zodResolver } from '@hookform/resolvers/zod';
import { vi, it, expect, describe, afterEach, beforeEach } from 'vitest';
import { render, screen, within, cleanup, waitFor } from '@testing-library/react';

import {
  Form,
  DateField,
  MonthField,
  TextField,
  UiProvider,
  FormSection,
  ErrorSummary,
  FormTextField,
  FormSelectField,
  FormSubmitButton,
} from './index';
import { resetPage, stubWidth, expectNoAxeViolations } from './local-test-support';

beforeEach(() => stubWidth(false));

afterEach(() => {
  cleanup();
  resetPage();
});

/** A field that keeps what was typed, shown in an output so the test can read it. */
function Field(props: Omit<TextFieldExtendedProps, 'value' | 'onChange'>) {
  const [value, setValue] = useState('');
  return (
    <UiProvider>
      <TextField {...props} value={value} onChange={setValue} />
      <output>{value}</output>
    </UiProvider>
  );
}

describe('the number kinds', () => {
  it('keeps whole numbers only, typed in either set of digits', async () => {
    const user = userEvent.setup();
    render(<Field label="Family members" type="integer" />);
    const box = screen.getByRole('textbox', { name: 'Family members' });
    expect(box).toHaveAttribute('inputmode', 'numeric');
    await user.type(box, '১২a3');
    expect(screen.getByRole('status')).toHaveTextContent(/^123$/);
  });

  it('keeps two decimals of money, with the taka sign beside it', async () => {
    const user = userEvent.setup();
    render(<Field label="Amount" type="money" />);
    const box = screen.getByRole('textbox', { name: 'Amount' });
    expect(box).toHaveAttribute('inputmode', 'decimal');
    expect(screen.getByText('৳')).toBeInTheDocument();
    await user.type(box, '1,250.505');
    expect(screen.getByRole('status')).toHaveTextContent(/^1250.50$/);
  });

  it('gives an identity number the numeric keypad and its length', async () => {
    const user = userEvent.setup();
    render(<Field label="NID" type="nid" />);
    const box = screen.getByRole('textbox', { name: 'NID' });
    expect(box).toHaveAttribute('inputmode', 'numeric');
    expect(box).toHaveAttribute('maxlength', '17');
    await user.type(box, '১২৩ 456');
    expect(screen.getByRole('status')).toHaveTextContent(/^123456$/);
  });
});

describe('the mobile number', () => {
  it('takes English digits, the phone keypad and no autofill', async () => {
    const user = userEvent.setup();
    render(<Field label="Mobile" type="tel" />);
    const box = screen.getByRole('textbox', { name: 'Mobile' });
    expect(box).toHaveAttribute('inputmode', 'tel');
    expect(box).toHaveAttribute('autocomplete', 'off');
    await user.type(box, '০১৭১১-000000');
    expect(screen.getByRole('status')).toHaveTextContent(/^01711000000$/);
  });

  it('shows an action inside its end', () => {
    render(<Field label="Mobile" type="tel" endAction={<button type="button">Verify</button>} />);
    expect(screen.getByRole('button', { name: 'Verify' })).toBeInTheDocument();
  });
});

describe('the password', () => {
  it('shows and hides the password by a pressed button', async () => {
    const user = userEvent.setup();
    render(<Field label="Password" type="password" autoComplete="current-password" />);
    const box = screen.getByLabelText('Password', { selector: 'input' });
    expect(box).toHaveAttribute('type', 'password');
    await user.click(screen.getByRole('button', { name: 'Show password' }));
    expect(box).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Hide password' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});

describe('the field states', () => {
  it('keeps a locked field readable, says it is locked, and offers a correction', async () => {
    const user = userEvent.setup();
    const onRequestCorrection = vi.fn();
    render(
      <UiProvider>
        <TextField
          label="Name"
          value="Amina Khatun"
          onChange={() => {}}
          locked
          onRequestCorrection={onRequestCorrection}
        />
      </UiProvider>,
    );
    const box = screen.getByRole('textbox', { name: 'Name' });
    expect(box).toHaveAttribute('readonly');
    expect(box).toHaveValue('Amina Khatun');
    expect(screen.getByText('Locked')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Request correction' }));
    expect(onRequestCorrection).toHaveBeenCalledTimes(1);
  });

  it('marks a changed field with its previous value, and a field only officials see', () => {
    render(
      <UiProvider>
        <TextField
          label="Mobile"
          value="01811000000"
          onChange={() => {}}
          previousValue="01711000000"
          officialOnly
        />
      </UiProvider>,
    );
    expect(screen.getByText('Changed')).toBeInTheDocument();
    expect(screen.getByText('Previous value: 01711000000')).toBeInTheDocument();
    expect(screen.getByText('Officials only')).toBeInTheDocument();
  });

  it('links its error to the control by the id the page gives', () => {
    render(
      <UiProvider>
        <TextField
          id="mobile"
          label="Mobile"
          value=""
          onChange={() => {}}
          error="Enter 11 digits"
        />
      </UiProvider>,
    );
    const box = screen.getByRole('textbox', { name: 'Mobile' });
    expect(box).toHaveAttribute('id', 'mobile');
    expect(box).toHaveAttribute('aria-invalid', 'true');
    expect(box).toHaveAccessibleDescription('Enter 11 digits');
  });

  it('tells a screen reader a field is locked or changed, beside its help', () => {
    render(
      <UiProvider>
        <TextField
          label="Name"
          value="Amina Khatun"
          onChange={() => {}}
          locked
          hint="From the profile"
        />
        <TextField
          label="Mobile"
          value="01811000000"
          onChange={() => {}}
          previousValue="01711000000"
        />
      </UiProvider>,
    );
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveAccessibleDescription(
      /From the profile.*Locked/,
    );
    expect(screen.getByRole('textbox', { name: 'Mobile' })).toHaveAccessibleDescription(
      /Changed.*Previous value: 01711000000/,
    );
  });
});

describe('the error summary and the form section', () => {
  it('takes focus, lists each error and moves to its field', async () => {
    const user = userEvent.setup();
    render(
      <UiProvider>
        <ErrorSummary errors={[{ fieldId: 'mobile', message: 'Enter 11 digits' }]} />
        <FormSection title="Contact" description="How we reach the person">
          <TextField
            id="mobile"
            label="Mobile"
            value=""
            onChange={() => {}}
            error="Enter 11 digits"
          />
        </FormSection>
      </UiProvider>,
    );
    const summary = screen.getByRole('alert');
    expect(summary).toHaveFocus();
    expect(within(summary).getByText('Please correct the following:')).toBeInTheDocument();
    await user.click(within(summary).getByRole('link', { name: 'Enter 11 digits' }));
    expect(screen.getByRole('textbox', { name: 'Mobile' })).toHaveFocus();
    expect(screen.getByRole('group', { name: 'Contact' })).toHaveTextContent(
      'How we reach the person',
    );
  });

  it('shows nothing without errors', () => {
    render(
      <UiProvider>
        <ErrorSummary errors={[]} />
      </UiProvider>,
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each(['light', 'dark'] as const)('passes axe, %s', async (mode) => {
    window.localStorage.setItem('asf-mode', mode);
    const { container } = render(
      <UiProvider>
        <ErrorSummary errors={[{ fieldId: 'nid', message: 'Check the NID' }]} />
        <FormSection title="Identity">
          <TextField
            id="nid"
            label="NID"
            type="nid"
            value=""
            onChange={() => {}}
            error="Check the NID"
          />
          <TextField
            label="Name"
            value="Amina"
            onChange={() => {}}
            locked
            onRequestCorrection={() => {}}
            previousValue="Amena"
          />
          <TextField label="Amount" type="money" value="10" onChange={() => {}} />
          <TextField
            label="Password"
            type="password"
            value=""
            onChange={() => {}}
            autoComplete="new-password"
          />
        </FormSection>
      </UiProvider>,
    );
    await expectNoAxeViolations(container);
  });
});

describe('the error summary while the person corrects', () => {
  it('leaves the focus in the field as the errors change, and takes it again on the next submit', () => {
    const view = (message: string, submits: number) => (
      <UiProvider>
        <ErrorSummary focusKey={submits} errors={[{ fieldId: 'mobile', message }]} />
        <TextField id="mobile" label="Mobile" value="" onChange={() => {}} error={message} />
      </UiProvider>
    );
    const { rerender } = render(view('Enter 11 digits', 1));
    expect(screen.getByRole('alert')).toHaveFocus();
    screen.getByRole('textbox', { name: 'Mobile' }).focus();
    rerender(view('Start with 01', 1));
    expect(screen.getByRole('textbox', { name: 'Mobile' })).toHaveFocus();
    rerender(view('Start with 01', 2));
    expect(screen.getByRole('alert')).toHaveFocus();
  });
});

describe('the date field', () => {
  it('shows a date as day-month-year in the words the app gives', async () => {
    const user = userEvent.setup();
    render(
      <UiProvider
        labels={{
          datePartDay: 'দিন',
          datePartMonth: 'মাস',
          datePartYear: 'বছর',
          openCalendar: 'ক্যালেন্ডার খুলুন',
        }}
      >
        <DateField label="আবেদনের তারিখ" value="2026-11-04" onChange={() => {}} />
      </UiProvider>,
    );
    const field = screen.getByRole('group', { name: 'আবেদনের তারিখ' });
    expect(field).toHaveTextContent('04-11-2026');
    expect(within(field).getByRole('spinbutton', { name: 'দিন' })).toHaveTextContent('04');
    expect(within(field).getByRole('spinbutton', { name: 'মাস' })).toHaveTextContent('11');
    expect(within(field).getByRole('spinbutton', { name: 'বছর' })).toHaveTextContent('2026');
    await user.click(screen.getByRole('button', { name: /ক্যালেন্ডার খুলুন/ }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it("names the calendar's months and days in the words the app gives, with English digits", async () => {
    const user = userEvent.setup();
    const months =
      'জানুয়ারি,ফেব্রুয়ারি,মার্চ,এপ্রিল,মে,জুন,জুলাই,আগস্ট,সেপ্টেম্বর,অক্টোবর,নভেম্বর,ডিসেম্বর';
    render(
      <UiProvider
        labels={{
          openCalendar: 'ক্যালেন্ডার খুলুন',
          monthNames: months,
          weekdayNames: 'রবি,সোম,মঙ্গল,বুধ,বৃহ,শুক্র,শনি',
          switchToYearView: 'বছর বেছে নিন',
        }}
      >
        <DateField label="আবেদনের তারিখ" value="2026-11-04" onChange={() => {}} />
        <MonthField label="শুরুর মাস" value="2026-01" onChange={() => {}} />
      </UiProvider>,
    );
    // the month field writes the month's name, and the year in English digits
    expect(screen.getByRole('group', { name: 'শুরুর মাস' })).toHaveTextContent('জানুয়ারি 2026');
    await user.click(screen.getAllByRole('button', { name: /ক্যালেন্ডার খুলুন/ })[0]!);
    const calendar = await screen.findByRole('dialog');
    expect(calendar).toHaveTextContent('নভেম্বর 2026');
    expect(calendar).not.toHaveTextContent('November');
    expect(within(calendar).getByText('রবি')).toBeInTheDocument();
    expect(within(calendar).getByRole('button', { name: /বছর বেছে নিন/ })).toBeInTheDocument();
    expect(within(calendar).getByRole('gridcell', { name: '4' })).toBeInTheDocument();
  });

  it("uses the given names in English too, not the date library's own", async () => {
    const user = userEvent.setup();
    render(
      <UiProvider labels={{ weekdayNames: 'Sun,Mon,Tue,Wed,Thu,Fri,Sat' }}>
        <DateField label="Date" value="2026-11-04" onChange={() => {}} />
      </UiProvider>,
    );
    await user.click(screen.getByRole('button', { name: /Open calendar/ }));
    const calendar = await screen.findByRole('dialog');
    expect(calendar).toHaveTextContent('November 2026');
    expect(within(calendar).getByText('Sun')).toBeInTheDocument();
  });
});

const codeSchema = z.object({
  code: z.string().regex(/^[0-9]{6}$/, 'Enter the six digits'),
  size: z.string().min(1, 'Choose a size'),
});
type CodeForm = z.infer<typeof codeSchema>;

function CodeForm({ onSubmit }: { onSubmit: (values: CodeForm) => void }) {
  const form = useForm<CodeForm>({
    resolver: zodResolver(codeSchema),
    defaultValues: { code: '', size: '' },
  });
  return (
    <UiProvider>
      <Form form={form} onSubmit={onSubmit} label="Verify">
        <FormTextField
          name="code"
          label="Code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          normalize={(value) => value.replace(/\D/g, '').slice(0, 6)}
          endAction={<span>sent</span>}
        />
        <FormSelectField
          name="size"
          label="Size"
          placeholder="Choose"
          options={[
            { value: 's', label: 'Small' },
            { value: 'm', label: 'Medium' },
          ]}
        />
        <FormSubmitButton>Verify</FormSubmitButton>
      </Form>
    </UiProvider>
  );
}

describe('the extended fields bound to a form', () => {
  it('keeps the normalized text, passes the extended props, and shows the schema messages', async () => {
    const user = userEvent.setup();
    const submitted: CodeForm[] = [];
    render(<CodeForm onSubmit={(values) => submitted.push(values)} />);
    const code = screen.getByRole('textbox', { name: 'Code' });
    expect(code).toHaveAttribute('inputmode', 'numeric');
    expect(code).toHaveAttribute('autocomplete', 'one-time-code');
    expect(code).toHaveAttribute('maxlength', '6');
    expect(screen.getByText('sent')).toBeInTheDocument();

    await user.type(code, '12a3');
    expect(code).toHaveValue('123');
    await user.click(screen.getByRole('button', { name: 'Verify' }));
    expect(await screen.findByText('Enter the six digits')).toBeInTheDocument();
    expect(screen.getByText('Choose a size')).toBeInTheDocument();
    expect(submitted).toEqual([]);

    await user.type(code, '4567');
    expect(code).toHaveValue('123456');
    await user.click(screen.getByRole('combobox', { name: 'Size' }));
    await user.click(await screen.findByRole('option', { name: 'Medium' }));
    await user.click(screen.getByRole('button', { name: 'Verify' }));
    await waitFor(() => expect(submitted).toEqual([{ code: '123456', size: 'm' }]));
  });
});
