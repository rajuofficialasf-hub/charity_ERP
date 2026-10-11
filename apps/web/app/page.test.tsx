import { expectNoAxeViolations } from '@css/ui/testing';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import HomePage from './page';

describe('HomePage', () => {
  it('shows the system name (UX-09) without accessibility violations', async () => {
    const { container } = render(<HomePage />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'চ্যারিটি ও সোশ্যাল সার্ভিস' }),
    ).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });
});
