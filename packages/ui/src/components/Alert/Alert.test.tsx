import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations, renderWithUi } from '../../testing/index.js';
import { Alert } from './Alert.js';

describe('Alert (DESIGN_SYSTEM 5.11)', () => {
  it('shows icon, title and message; static alerts are not live regions', async () => {
    const { container } = renderWithUi(
      <Alert tone="warning" title="সম্ভাব্য পারিবারিক ডুপ্লিকেট">
        একই গ্রামে একই বাবার নাম পাওয়া গেছে।
      </Alert>,
      { locale: 'bn' },
    );
    expect(container.querySelector('.ui-alert.t-warning')).not.toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    await expectNoAxeViolations(container);
  });

  it('announces errors that just happened and can be dismissed', async () => {
    const onDismiss = vi.fn();
    const user = userEvent.setup();
    renderWithUi(<Alert tone="danger" title="Saving failed" live="alert" onDismiss={onDismiss} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Saving failed');
    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
