import { screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { LogOut, MonitorSmartphone, User } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations, renderWithUi } from '../../testing/index.js';
import { MenuButton } from './MenuButton.js';

// The menu button of the app bar (the profile menu): the APG menu button pattern.
describe('MenuButton', () => {
  const items = (onLogout = vi.fn()) => [
    { id: 'profile', label: 'আমার প্রোফাইল', icon: User, href: '/account/profile' },
    { id: 'devices', label: 'আমার ডিভাইস', icon: MonitorSmartphone, href: '/account/sessions' },
    { id: 'logout', label: 'লগআউট', icon: LogOut, onAction: onLogout },
  ];

  it('opens with a click, lists links and actions, and runs an action', async () => {
    const onLogout = vi.fn();
    const user = userEvent.setup();
    const { container } = renderWithUi(
      <MenuButton label="প্রোফাইল মেনু" items={items(onLogout)}>
        নমুনা কর্মকর্তা
      </MenuButton>,
      { locale: 'bn' },
    );
    const button = screen.getByRole('button', { name: 'প্রোফাইল মেনু' });
    expect(button).toHaveTextContent('নমুনা কর্মকর্তা');
    expect(button).toHaveAttribute('aria-haspopup', 'true');
    await user.click(button);
    const menu = screen.getByRole('menu', { name: 'প্রোফাইল মেনু' });
    expect(menu).toBeVisible();
    expect(screen.getByRole('menuitem', { name: 'আমার প্রোফাইল' })).toHaveAttribute(
      'href',
      '/account/profile',
    );
    await expectNoAxeViolations(container);
    await user.click(screen.getByRole('menuitem', { name: 'লগআউট' }));
    expect(onLogout).toHaveBeenCalledOnce();
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('works by keyboard: Enter opens, arrows move, Escape closes and returns focus', async () => {
    const user = userEvent.setup();
    renderWithUi(<MenuButton label="প্রোফাইল মেনু" items={items()} />, { locale: 'bn' });
    const button = screen.getByRole('button', { name: 'প্রোফাইল মেনু' });
    button.focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('menuitem', { name: 'আমার প্রোফাইল' })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'আমার ডিভাইস' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    // focus comes back once the menu has closed
    await waitFor(() => expect(button).toHaveFocus());
  });
});
