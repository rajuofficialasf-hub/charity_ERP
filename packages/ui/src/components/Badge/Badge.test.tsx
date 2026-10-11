import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations, renderWithUi } from '../../testing/index.js';
import { Avatar } from '../Avatar/Avatar.js';
import { Badge, STATUS_STYLES, StatusBadge } from './Badge.js';

describe('Badge / Status (DESIGN_SYSTEM 5.2)', () => {
  it('maps every workflow state to the documented tone', () => {
    const tones = Object.fromEntries(Object.entries(STATUS_STYLES).map(([k, v]) => [k, v.tone]));
    expect(tones).toMatchObject({
      draft: 'neutral',
      needs_verification: 'warning',
      submitted: 'info',
      under_review: 'info',
      reviewed: 'info',
      waitlisted: 'warning',
      approved: 'success',
      rejected: 'danger',
      implementation: 'brand',
      completed: 'success',
      closed: 'neutral',
      deleted: 'neutral',
      blocklisted: 'danger',
    });
  });

  it('always shows an icon beside a status label and hides the icon from readers', async () => {
    const { container } = renderWithUi(
      <>
        <StatusBadge status="approved" label="অনুমোদিত" />
        <StatusBadge status="sync_failed" label="সিঙ্ক হয়নি" size="sm" />
        <Badge label="নতুন" tone="brand" />
      </>,
      { locale: 'bn' },
    );
    const approved = screen.getByText('অনুমোদিত');
    expect(approved).toHaveClass('ui-badge', 't-success');
    expect(approved.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByText('সিঙ্ক হয়নি')).toHaveClass('t-danger', 'ui-badge-sm');
    await expectNoAxeViolations(container);
  });

  it('Avatar uses the first grapheme of two words and can carry a name', async () => {
    const { container } = renderWithUi(
      <>
        <Avatar name="রহিমা খাতুন" />
        <Avatar name="Karim Uddin" decorative={false} />
      </>,
    );
    const [first] = container.querySelectorAll('.ui-avatar');
    expect(first).toHaveTextContent('রখ');
    expect(screen.getByRole('img', { name: 'Karim Uddin' })).toHaveTextContent('KU');
    await expectNoAxeViolations(container);
  });
});
