import { expectNoAxeViolations } from '@/ui/testing';
import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { refreshAs, renderApp } from '../../test/auth';
import { resetClientForTests } from '../api/client';
import { DialogButtons } from './DialogButtons';

describe('DialogButtons', () => {
  beforeEach(() => {
    resetClientForTests();
    refreshAs(null);
  });

  it('cancels and confirms, the action named by the page', async () => {
    const user = userEvent.setup();
    const cancel = vi.fn();
    const confirm = vi.fn();
    const { container } = renderApp(
      <DialogButtons onCancel={cancel} onConfirm={confirm} confirmLabel="সংরক্ষণ" />,
    );
    await user.click(await screen.findByRole('button', { name: 'বাতিল' }));
    await user.click(screen.getByRole('button', { name: 'সংরক্ষণ' }));
    expect(cancel).toHaveBeenCalledOnce();
    expect(confirm).toHaveBeenCalledOnce();
    await expectNoAxeViolations(container);
  });

  it('keeps cancel still while the action runs, and the action shut until it may run', async () => {
    renderApp(
      <>
        <DialogButtons onCancel={() => {}} onConfirm={() => {}} confirmLabel="ফেরত পাঠান" pending />
        <DialogButtons onCancel={() => {}} onConfirm={() => {}} confirmLabel="নাকচ" disabled />
      </>,
    );
    expect(await screen.findAllByRole('button', { name: 'বাতিল' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'বাতিল' })[0]).toBeDisabled();
    expect(screen.getByRole('button', { name: 'নাকচ' })).toBeDisabled();
    expect(screen.getAllByRole('button', { name: 'বাতিল' })[1]).toBeEnabled();
  });
});
