import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { ClipboardList, Home } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations, renderWithUi } from '../../testing/index.js';
import { Breadcrumb } from '../Breadcrumb/Breadcrumb.js';
import { NavItem } from '../NavItem/NavItem.js';
import { Tabs, type TabItem } from './Tabs.js';

const items: TabItem[] = [
  { id: 'answers', label: 'উত্তর', content: <p>উত্তরসমূহ</p> },
  { id: 'timeline', label: 'ইতিহাস', count: 4, content: <p>সময়রেখা</p> },
  { id: 'log', label: 'পরিবর্তন', content: <p>পরিবর্তনের তালিকা</p> },
];

describe('Tabs (DESIGN_SYSTEM 5.13)', () => {
  it('follows the APG tabs pattern: arrows, Home, End and labelled panels', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const { container } = renderWithUi(
      <Tabs items={items} label="বিস্তারিত" onChange={onChange} />,
      {
        locale: 'bn',
      },
    );
    expect(screen.getByRole('tablist', { name: 'বিস্তারিত' })).toBeInTheDocument();
    const [first] = screen.getAllByRole('tab');
    expect(first).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('উত্তরসমূহ');
    await user.click(first!);
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'ইতিহাস, 4টি অপেক্ষমাণ' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await user.keyboard('{End}');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('পরিবর্তনের তালিকা');
    await user.keyboard('{Home}');
    expect(onChange).toHaveBeenLastCalledWith('answers');
    await expectNoAxeViolations(container);
  });

  it('offers a select for more than five tabs (shown on phones by CSS)', async () => {
    const user = userEvent.setup();
    const many = Array.from({ length: 6 }, (_, i) => ({
      id: `t${i}`,
      label: `Tab ${i}`,
      content: <p>Panel {i}</p>,
    }));
    const { container } = renderWithUi(<Tabs items={many} label="Sections" />);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Choose a section' }), 't4');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Panel 4');
    await expectNoAxeViolations(container);
  });
});

describe('Breadcrumb (DESIGN_SYSTEM 5.14)', () => {
  it('marks the current page and offers a back link to the parent for phones', async () => {
    const { container } = renderWithUi(
      <Breadcrumb
        items={[
          { id: 'p', label: 'Projects', href: '/projects' },
          { id: 'w', label: 'Winter Clothing 2026', href: '/projects/wnt' },
          { id: 'a', label: 'Applications' },
        ]}
      />,
    );
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to Winter Clothing 2026' })).toHaveAttribute(
      'href',
      '/projects/wnt',
    );
    expect(screen.getByText('Applications').closest('[aria-current]')).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expectNoAxeViolations(container);
  });
});

describe('Nav / Item (DESIGN_SYSTEM 5.5)', () => {
  it('marks the active page and puts the count into the accessible name', async () => {
    const { container } = renderWithUi(
      <nav aria-label="Main">
        <NavItem icon={Home} label="Home" href="/" active />
        <NavItem icon={ClipboardList} label="Review" href="/review" badge={12} variant="tab-bar" />
        <NavItem icon={ClipboardList} label="Alerts" href="/alerts" badge={250} variant="rail" />
      </nav>,
    );
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Review, 12 pending' })).not.toHaveAttribute(
      'aria-current',
    );
    expect(screen.getByRole('link', { name: 'Alerts, 99+ pending' })).toHaveTextContent('99+');
    await expectNoAxeViolations(container);
  });
});
