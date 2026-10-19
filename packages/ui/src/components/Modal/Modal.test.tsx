import { screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations, renderWithUi } from '../../testing/index.js';
import { Button } from '../Button/Button.js';
import { TextField } from '../Field/TextField.js';
import { ConfirmDialog, Drawer, Modal } from './Modal.js';

function ModalHarness({ dismissible = true }: { dismissible?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onPress={() => setOpen(true)}>ফিল্ড আনলক</Button>
      <Modal
        title="ফিল্ড আনলক করুন"
        isOpen={open}
        onClose={() => setOpen(false)}
        dismissible={dismissible}
        primaryAction={<Button onPress={() => setOpen(false)}>আনলক</Button>}
        secondaryAction={
          <Button variant="secondary" onPress={() => setOpen(false)}>
            বাতিল
          </Button>
        }
      >
        <TextField label="নতুন মান" />
      </Modal>
    </>
  );
}

describe('Modal (DESIGN_SYSTEM 5.8)', () => {
  it('is a labelled modal dialog that traps focus, closes on Escape and returns focus', async () => {
    const user = userEvent.setup();
    renderWithUi(<ModalHarness />, { locale: 'bn' });
    const trigger = screen.getByRole('button', { name: 'ফিল্ড আনলক' });
    await user.click(trigger);
    const dialog = await screen.findByRole('dialog', { name: 'ফিল্ড আনলক করুন' });
    await expectNoAxeViolations(dialog);
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    for (let i = 0; i < 6; i++) await user.tab();
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    // React Aria restores focus after the dialog has unmounted, a frame later on slow machines.
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('cannot be dismissed with Escape while saving', async () => {
    const user = userEvent.setup();
    renderWithUi(<ModalHarness dismissible={false} />);
    await user.click(screen.getByRole('button', { name: 'ফিল্ড আনলক' }));
    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

describe('Drawer (DESIGN_SYSTEM 5.9)', () => {
  it('opens as a labelled dialog with a close handle and a close button', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderWithUi(
      <Drawer title="Filters" isOpen onClose={onClose} footer={<Button>Apply</Button>}>
        <p>filter controls</p>
      </Drawer>,
    );
    const dialog = await screen.findByRole('dialog', { name: 'Filters' });
    await expectNoAxeViolations(dialog);
    const closers = screen.getAllByRole('button', { name: 'Close' });
    expect(closers).toHaveLength(2); // handle and header button
    await user.click(closers[0]!);
    expect(onClose).toHaveBeenCalled();
  });
});

describe('Confirm dialog (DESIGN_SYSTEM 5.10)', () => {
  it('is an alertdialog; confirm stays disabled until a reason is entered; focus starts on cancel', async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    renderWithUi(
      <ConfirmDialog
        isOpen
        tone="danger"
        title="Reject the application of Rahima Khatun?"
        message="The volunteer is told the reason."
        consequence={['The application moves to rejected']}
        reasonRequired
        confirmLabel="Reject application"
        onConfirm={onConfirm}
        onCancel={() => {}}
      />,
    );
    const dialog = await screen.findByRole('alertdialog', { name: /Reject the application/ });
    expect(dialog).toHaveAccessibleDescription('The volunteer is told the reason.');
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    const confirm = screen.getByRole('button', { name: 'Reject application' });
    expect(confirm).toBeDisabled();
    await user.type(screen.getByRole('textbox', { name: /Reason/ }), '  Income above the limit ');
    expect(confirm).toBeEnabled();
    await user.click(confirm);
    expect(onConfirm).toHaveBeenCalledWith('Income above the limit');
    await expectNoAxeViolations(dialog);
  });

  it('a pending confirmation ignores Escape and the scrim', async () => {
    const onCancel = vi.fn();
    const user = userEvent.setup();
    renderWithUi(
      <ConfirmDialog
        isOpen
        pending
        title="Close the project?"
        confirmLabel="Close project"
        onConfirm={() => {}}
        onCancel={onCancel}
      />,
    );
    await screen.findByRole('alertdialog');
    await user.keyboard('{Escape}');
    await user.click(document.querySelector('.MuiBackdrop-root')!);
    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });
});
