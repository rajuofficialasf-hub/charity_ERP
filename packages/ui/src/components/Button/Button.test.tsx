import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { Plus, Trash2 } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations, renderWithUi } from '../../testing/index.js';
import { Button } from './Button.js';

describe('Button (DESIGN_SYSTEM 5.1)', () => {
  it('is a native button operated by mouse, Enter and Space', async () => {
    const onPress = vi.fn();
    const user = userEvent.setup();
    renderWithUi(<Button onPress={onPress}>আবেদন অনুমোদন</Button>, { locale: 'bn' });
    const button = screen.getByRole('button', { name: 'আবেদন অনুমোদন' });
    expect(button).toHaveAttribute('type', 'button');
    await user.click(button);
    button.focus();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(onPress).toHaveBeenCalledTimes(3);
  });

  it('keeps the design-system classes of every variant and size as hooks', () => {
    const { container } = renderWithUi(
      <>
        <Button>p</Button>
        <Button variant="secondary">s</Button>
        <Button variant="ghost" size="sm">
          g
        </Button>
        <Button variant="danger" icon={Trash2}>
          d
        </Button>
      </>,
    );
    const [primary, secondary, ghost, danger] = [...container.querySelectorAll('button')];
    expect(primary).toHaveClass('ui-btn', 'ui-btn-primary');
    expect(secondary).toHaveClass('ui-btn', 'ui-btn-secondary');
    expect(ghost).toHaveClass('ui-btn', 'ui-btn-ghost', 'ui-btn-sm');
    expect(danger).toHaveClass('ui-btn', 'ui-btn-danger');
  });

  it('gives an icon-only button its accessible name from the children', async () => {
    const { container } = renderWithUi(
      <Button icon={Plus} iconOnly>
        Add
      </Button>,
    );
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    await expectNoAxeViolations(container);
  });

  it('ignores presses while loading and stays focusable', async () => {
    const onPress = vi.fn();
    const user = userEvent.setup();
    renderWithUi(
      <Button loading onPress={onPress}>
        Save
      </Button>,
    );
    const button = screen.getByRole('button', { name: /Save/ });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toHaveAttribute('data-pending', 'true');
    expect(button).not.toBeDisabled(); // stays focusable while pending
    await user.click(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('is disabled natively and renders links that navigate as anchors', async () => {
    const { container } = renderWithUi(
      <>
        <Button disabled>Off</Button>
        <Button href="/projects" variant="secondary">
          Projects
        </Button>
      </>,
    );
    expect(screen.getByRole('button', { name: 'Off' })).toBeDisabled();
    expect(screen.getByRole('link', { name: 'Projects' })).toHaveAttribute('href', '/projects');
    await expectNoAxeViolations(container);
  });
});
