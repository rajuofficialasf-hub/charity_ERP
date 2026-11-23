import { cleanup, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../test/auth';
import { DialogActions } from './DialogActions';

// The footer the admin dialogs share: "cancel" and the dialog's own action.
describe('the footer of an admin dialog', () => {
  it('cancels and acts with the words the dialog gives', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const onSubmit = vi.fn();
    renderApp(
      <DialogActions
        cancelLabel="বাতিল"
        onCancel={onCancel}
        submitLabel="সংরক্ষণ করুন"
        onSubmit={onSubmit}
        pending={false}
      />,
    );
    await user.click(await screen.findByRole('button', { name: 'বাতিল' }));
    await user.click(screen.getByRole('button', { name: 'সংরক্ষণ করুন' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('holds the cancel while the action runs, and the action while it may not run', async () => {
    const footer = (over: { pending: boolean; disabled?: boolean }) => (
      <DialogActions
        cancelLabel="বাতিল"
        onCancel={() => {}}
        submitLabel="সংরক্ষণ করুন"
        onSubmit={() => {}}
        {...over}
      />
    );
    renderApp(footer({ pending: true }));
    expect(await screen.findByRole('button', { name: 'বাতিল' })).toBeDisabled();
    cleanup();
    renderApp(footer({ pending: false, disabled: true }));
    expect(await screen.findByRole('button', { name: 'বাতিল' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'সংরক্ষণ করুন' })).toBeDisabled();
  });
});
