import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations, renderWithUi } from '../../testing/index.js';
import { PageBand } from './PageBand.js';

describe('PageBand (UX-16)', () => {
  it('renders the title as the page heading with its one short line', async () => {
    const { container } = renderWithUi(
      <main>
        <PageBand title="স্বেচ্ছাসেবক নিবন্ধন" subtitle="নিচের তথ্য পূরণ করুন" />
      </main>,
      { locale: 'bn' },
    );
    expect(
      screen.getByRole('heading', { level: 1, name: 'স্বেচ্ছাসেবক নিবন্ধন' }),
    ).toBeInTheDocument();
    expect(screen.getByText('নিচের তথ্য পূরণ করুন')).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });
});
