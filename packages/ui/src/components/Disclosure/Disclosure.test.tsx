import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { Pencil } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations, renderWithUi } from '../../testing/index.js';
import { Disclosure } from './Disclosure.js';

describe('Disclosure', () => {
  it('opens and closes its body from the heading button', async () => {
    const user = userEvent.setup();
    const { container } = renderWithUi(
      <Disclosure title="মূল তথ্য" hint="ঐচ্ছিক" icon={Pencil}>
        <p>ভেতরের লেখা</p>
      </Disclosure>,
      { locale: 'bn' },
    );
    const toggle = screen.getByRole('button', { name: 'মূল তথ্য ঐচ্ছিক' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('ভেতরের লেখা')).not.toBeVisible();
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('ভেতরের লেখা')).toBeVisible();
    expect(screen.getByRole('heading', { level: 3, name: 'মূল তথ্য ঐচ্ছিক' })).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it('follows an open value from outside and reports a press', async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    renderWithUi(
      <Disclosure title="Options" open onToggle={onToggle} headingLevel={2}>
        <p>inside</p>
      </Disclosure>,
    );
    expect(screen.getByText('inside')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Options' }));
    expect(onToggle).toHaveBeenCalledWith(false);
    // still open: the value comes from outside
    expect(screen.getByText('inside')).toBeVisible();
  });
});
