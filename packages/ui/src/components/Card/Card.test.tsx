import { screen } from '@testing-library/react';
import { Clock } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations, renderWithUi } from '../../testing/index.js';
import { Button } from '../Button/Button.js';
import { AttentionCard, Card, StatCard } from './Card.js';

describe('Card / Stat (DESIGN_SYSTEM 5.3)', () => {
  it('renders a titled card with actions, and a linked card as one link named by its title', async () => {
    const { container } = renderWithUi(
      <>
        <Card
          title="প্রকল্প"
          subtitle="শীতবস্ত্র"
          actions={<Button variant="ghost">সম্পাদনা</Button>}
        >
          <p>বিবরণ</p>
        </Card>
        <Card title="শীতবস্ত্র বিতরণ 2026" href="/projects/wnt" />
        <Card accent title="ঘোষণা" />
      </>,
      { locale: 'bn' },
    );
    expect(screen.getByRole('heading', { level: 3, name: 'প্রকল্প' })).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'শীতবস্ত্র বিতরণ 2026' });
    expect(link).toHaveAttribute('href', '/projects/wnt');
    expect(link.querySelector('button')).toBeNull();
    expect(container.querySelector('.ui-card-accent')).not.toBeNull();
    await expectNoAxeViolations(container);
  });

  it('stat card shows a tabular value with English digits and "value of target" with progress', async () => {
    const { container } = renderWithUi(<StatCard label="approved" value={1240} target={2000} />);
    expect(screen.getByText('1,240')).toHaveClass('ui-stat-value');
    expect(screen.getByText('1,240 of 2,000')).toBeInTheDocument();
    const bar = screen.getByRole('progressbar', { name: 'approved' });
    expect(bar).toHaveAttribute('aria-valuenow', '1240');
    expect(bar).toHaveAttribute('aria-valuetext', '1,240 of 2,000 (62%)');
    await expectNoAxeViolations(container);
  });

  it('stat card in Bengali keeps English digits', () => {
    renderWithUi(<StatCard label="অনুমোদিত" value={300000} target={500000} />, { locale: 'bn' });
    expect(screen.getByText('3,00,000')).toBeInTheDocument();
    expect(screen.getByText('5,00,000-এর মধ্যে 3,00,000')).toBeInTheDocument();
  });

  it('shows a skeleton while loading', () => {
    renderWithUi(<StatCard label="approved" value={0} loading />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading');
  });

  it('attention item: status border, reason, waiting time and one action or a link', async () => {
    const { container } = renderWithUi(
      <>
        <AttentionCard
          tone="warning"
          icon={Clock}
          title="12 applications waiting"
          reason="Review before Friday"
          meta="waiting 6 days"
          href="/review"
        />
        <AttentionCard
          icon={Clock}
          title="3 photos missing"
          action={<Button size="sm">Open</Button>}
        />
      </>,
    );
    expect(screen.getByRole('link', { name: /12 applications waiting/ })).toHaveClass(
      'ui-attention',
      't-warning',
    );
    expect(screen.getByRole('button', { name: 'Open' })).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });
});
