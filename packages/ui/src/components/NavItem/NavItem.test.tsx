import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { bn, en } from '@css/shared/i18n';
import { Bell } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { UiProvider } from '../../provider/UiProvider.js';
import { expectNoAxeViolations, renderWithUi } from '../../testing/index.js';
import { Breadcrumb } from '../Breadcrumb/Breadcrumb.js';
import { ProgressBar } from '../ProgressBar/ProgressBar.js';
import { NavItem } from './NavItem.js';

describe('NavItem', () => {
  it('marks the current page and names the count with the label', async () => {
    const { container } = renderWithUi(
      <nav aria-label="Main">
        <NavItem icon={Bell} label="Notifications" href="/notifications" active badge={120} />
        <NavItem icon={Bell} label="Projects" href="/projects" />
      </nav>,
    );
    const current = screen.getByRole('link', { name: /Notifications/ });
    expect(current).toHaveAttribute('aria-current', 'page');
    expect(current.getAttribute('aria-label')).toMatch(/99\+/);
    expect(screen.getByRole('link', { name: 'Projects' })).not.toHaveAttribute('aria-current');
    await expectNoAxeViolations(container);
  });

  it('goes to its page through the app router, without a page load', async () => {
    const navigate = vi.fn();
    const user = userEvent.setup();
    render(
      <UiProvider locale="en" messages={en.ui} formatNumber={String} navigate={navigate}>
        <NavItem icon={Bell} label="Projects" href="/projects" />
      </UiProvider>,
    );
    await user.click(screen.getByRole('link', { name: 'Projects' }));
    expect(navigate).toHaveBeenCalledWith('/projects');
  });
});

describe('Breadcrumb', () => {
  it('links the parents, marks the current page and offers the way back on phones', async () => {
    const { container } = renderWithUi(
      <Breadcrumb
        items={[
          { id: 'admin', label: 'Admin', href: '/admin' },
          { id: 'projects', label: 'Projects', href: '/admin/projects' },
          { id: 'one', label: 'Winter 2026' },
        ]}
      />,
    );
    const trail = screen.getByRole('navigation', { name: en.ui.nav.breadcrumb });
    expect(trail).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Admin' })).toHaveAttribute('href', '/admin');
    expect(screen.getByText('Winter 2026').closest('[aria-current="page"]')).not.toBeNull();
    expect(screen.queryByRole('link', { name: 'Winter 2026' })).toBeNull();
    // the trail's link and the phone's way back both lead to the parent
    const parents = screen.getAllByRole('link', { name: /Projects/ });
    expect(parents.map((link) => link.getAttribute('href'))).toEqual([
      '/admin/projects',
      '/admin/projects',
    ]);
    await expectNoAxeViolations(container);
  });
});

describe('ProgressBar', () => {
  it('is a progressbar with its value as text, in English digits in both languages', async () => {
    const { container } = renderWithUi(<ProgressBar label="Spent" value={1240} max={2000} />, {
      locale: 'bn',
    });
    const bar = screen.getByRole('progressbar', { name: 'Spent' });
    expect(bar).toHaveAttribute('aria-valuenow', '1240');
    expect(bar).toHaveAttribute('aria-valuemax', '2000');
    expect(bar.getAttribute('aria-valuetext')).toMatch(/62/);
    expect(bar.getAttribute('aria-valuetext')).not.toMatch(/[০-৯]/);
    expect(bn.ui.feedback.progressText).toBeTruthy();
    await expectNoAxeViolations(container);
  });

  it('never runs past its maximum', () => {
    renderWithUi(<ProgressBar label="Quota" value={2500} max={2000} />);
    expect(screen.getByRole('progressbar', { name: 'Quota' })).toHaveAttribute(
      'aria-valuenow',
      '2000',
    );
  });
});
