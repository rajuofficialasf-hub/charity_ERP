// @vitest-environment jsdom
// The overlays this app added to the asf template (listed in local.json): the dialog that stays
// open while saving and fills a phone, the confirm dialog with a reason, the menu and the drawer's
// bottom sheet.
import '@testing-library/jest-dom/vitest';

import type { ReactNode } from 'react';
import type { ConfirmDialogProps } from '@/ui/contract';

import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { vi, it, expect, describe, afterEach, beforeEach } from 'vitest';
import { render, screen, within, cleanup, waitFor } from '@testing-library/react';

import { resetPage, stubWidth, expectNoAxeViolations } from './local-test-support';
import { Menu, Dialog, Drawer, UiProvider, ConfirmDialog } from './index';

beforeEach(() => stubWidth(false));

afterEach(() => {
  cleanup();
  resetPage();
});

/** Renders `ui` inside the provider and a router, with a second page a link can reach. */
function renderInApp(ui: ReactNode) {
  const router = createMemoryRouter(
    [
      { path: '/profile', element: <h1>My profile</h1> },
      { path: '*', element: ui },
    ],
    { initialEntries: ['/'] }
  );
  return render(
    <UiProvider>
      <RouterProvider router={router} />
    </UiProvider>
  );
}

describe('the dialog', () => {
  it('cannot be closed while it is not dismissible', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <UiProvider>
        <Dialog open title="Edit project" onClose={onClose} dismissible={false}>
          <p>Saving…</p>
        </Dialog>
      </UiProvider>
    );
    await user.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Close' })).toBeDisabled();
  });

  it('closes by Escape when dismissible, and fills a phone when asked', async () => {
    stubWidth(true);
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <UiProvider>
        <Dialog open title="New application" onClose={onClose} fullScreenOnPhone>
          <p>A long form</p>
        </Dialog>
      </UiProvider>
    );
    expect(screen.getByRole('dialog', { name: 'New application' })).toHaveClass('MuiDialog-paperFullScreen');
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('the confirm dialog', () => {
  function Confirm(props: Partial<ConfirmDialogProps>) {
    return (
      <UiProvider>
        <ConfirmDialog
          open
          title="Reject the application of Amina Khatun?"
          message="The volunteer is told the reason."
          confirmLabel="Reject application"
          tone="danger"
          consequences={['The application leaves the review list', 'The score is kept']}
          reasonRequired
          onConfirm={() => {}}
          onCancel={() => {}}
          {...props}
        />
      </UiProvider>
    );
  }

  it('lists what follows and confirms only with a reason', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<Confirm onConfirm={onConfirm} />);
    const dialog = screen.getByRole('alertdialog', { name: 'Reject the application of Amina Khatun?' });
    expect(within(dialog).getByText('The volunteer is told the reason.')).toBeInTheDocument();
    expect(within(dialog).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['The application leaves the review list', 'The score is kept']);
    const confirm = within(dialog).getByRole('button', { name: 'Reject application' });
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByRole('textbox', { name: 'Reason' }), '   ');
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByRole('textbox', { name: 'Reason' }), 'Income above the limit');
    await user.click(confirm);
    expect(onConfirm).toHaveBeenCalledWith('Income above the limit');
  });

  it('cancels by its button and by Escape', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<Confirm onCancel={onCancel} reasonRequired={false} />);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it('stays open and busy while the action runs', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<Confirm onCancel={onCancel} reasonRequired={false} pending />);
    await user.keyboard('{Escape}');
    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Reject application/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });
});

describe('the menu', () => {
  it('opens its list from a named button, runs an action and follows a link', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderInApp(
      <Menu
        label="Row actions for Amina Khatun"
        items={[
          { id: 'block', label: 'Block', onSelect, tone: 'danger', icon: 'shield' },
          { id: 'profile', label: 'Open profile', to: '/profile', icon: 'user' },
          { id: 'merge', label: 'Merge', disabled: true },
        ]}
      />
    );
    const button = screen.getByRole('button', { name: 'Row actions for Amina Khatun' });
    expect(button).toHaveAttribute('aria-haspopup', 'true');
    await user.click(button);
    const menu = screen.getByRole('menu', { name: 'Row actions for Amina Khatun' });
    expect(within(menu).getByRole('menuitem', { name: 'Merge' })).toHaveAttribute('aria-disabled', 'true');
    await user.click(within(menu).getByRole('menuitem', { name: 'Block' }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    await user.click(button);
    await user.click(screen.getByRole('menuitem', { name: 'Open profile' }));
    expect(await screen.findByRole('heading', { name: 'My profile' })).toBeInTheDocument();
  });

  it('shows what the caller gives on its button', () => {
    renderInApp(
      <Menu label="Profile menu" items={[{ id: 'out', label: 'Sign out', onSelect: () => {} }]}>
        Amina Khatun
      </Menu>
    );
    expect(screen.getByRole('button', { name: 'Profile menu' })).toHaveTextContent('Amina Khatun');
  });
});

describe('the drawer', () => {
  it('opens from the bottom when asked', () => {
    render(
      <UiProvider>
        <Drawer open title="Filters" onClose={() => {}} side="bottom">
          <p>Fields</p>
        </Drawer>
      </UiProvider>
    );
    expect(screen.getByRole('dialog', { name: 'Filters' }).closest('.MuiDrawer-anchorBottom')).not.toBeNull();
  });

  it('is a bottom sheet on a phone whatever its side', () => {
    stubWidth(true);
    render(
      <UiProvider>
        <Drawer open title="Details" onClose={() => {}}>
          <p>Fields</p>
        </Drawer>
      </UiProvider>
    );
    expect(screen.getByRole('dialog', { name: 'Details' }).closest('.MuiDrawer-anchorBottom')).not.toBeNull();
  });
});

describe('the overlays together', () => {
  it.each(['light', 'dark'] as const)('pass axe, %s', async (mode) => {
    window.localStorage.setItem('asf-mode', mode);
    render(
      <UiProvider>
        <ConfirmDialog open title="Block Rahim Uddin?" confirmLabel="Block volunteer" tone="danger" reasonRequired consequences={['No new assignments']} onConfirm={() => {}} onCancel={() => {}} />
      </UiProvider>
    );
    // a dialog renders in a portal under the body
    await expectNoAxeViolations(document.body);
  });
});
