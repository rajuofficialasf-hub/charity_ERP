import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { Hash, Mail, Pencil, Phone, User } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations, renderWithUi } from '../../testing/index.js';
import { Avatar } from '../Avatar/Avatar.js';
import { Badge } from '../Badge/Badge.js';
import { Button } from '../Button/Button.js';
import { DescriptionList } from '../Layout/Layout.js';
import { ContactList, CopyButton, ProfileHeader, ProfileSection } from './Profile.js';

describe('the profile pieces', () => {
  it('shows the header with the name, the state, the facts and the actions, without accessibility violations', async () => {
    const { container } = renderWithUi(
      <ProfileHeader
        name="Sample Volunteer"
        avatar={<Avatar name="Sample Volunteer" size="lg" letters={1} />}
        status={<Badge tone="warning" label="Awaiting approval" />}
        facts={[
          { id: 'nid', label: 'NID', value: '1000065600', icon: Hash, showLabel: true, copy: true },
          { id: 'mobile', label: 'Mobile', value: '01700005600', icon: Phone, copy: true },
          { id: 'gender', label: 'Gender', value: 'Male', icon: User },
        ]}
        aside={<p>Documents</p>}
        actions={<Button variant="primary">Approve</Button>}
        actionsLabel="Actions"
      />,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Sample Volunteer' })).toBeInTheDocument();
    expect(screen.getByText('Awaiting approval')).toBeInTheDocument();
    expect(screen.getByText('NID: 1000065600')).toBeInTheDocument();
    // a fact without a written label still tells a screen reader what it is
    expect(screen.getByText('Mobile:')).toHaveClass('ui-sr-only');
    expect(screen.getByRole('button', { name: 'Copy NID' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Copy Gender' })).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Actions' })).toContainElement(
      screen.getByRole('button', { name: 'Approve' }),
    );
    await expectNoAxeViolations(container);
  });

  it('copies a value and says so', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderWithUi(<CopyButton value="01700005600" label="Mobile" />);
    await user.click(screen.getByRole('button', { name: 'Copy Mobile' }));
    expect(writeText).toHaveBeenCalledWith('01700005600');
    expect(await screen.findByRole('status')).toHaveTextContent('Mobile copied');
  });

  it('opens and closes a section by its title, and keeps the edit button outside the toggle', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    renderWithUi(
      <ProfileSection
        title="Personal details"
        icon={User}
        action={
          <Button variant="ghost" size="sm" iconOnly icon={Pencil} onPress={onEdit}>
            Edit personal details
          </Button>
        }
      >
        <DescriptionList
          columns={2}
          items={[
            { label: "Father's name", value: 'Sample Father', icon: User },
            { label: 'Email', value: 'a@example.org', icon: Mail },
          ]}
        />
      </ProfileSection>,
    );
    const toggle = screen.getByRole('button', { name: 'Personal details' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Sample Father')).toBeVisible();
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Sample Father')).not.toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Edit personal details' }));
    expect(onEdit).toHaveBeenCalled();
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('starts closed when asked', () => {
    renderWithUi(
      <ProfileSection title="Bank" defaultOpen={false}>
        <p>Hidden until opened</p>
      </ProfileSection>,
    );
    expect(screen.getByRole('button', { name: 'Bank' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Hidden until opened')).not.toBeVisible();
  });

  it('lists the contacts with their action links', async () => {
    const { container } = renderWithUi(
      <ContactList
        items={[
          {
            id: 'mobile',
            icon: Phone,
            label: 'Mobile',
            value: '01700005600',
            href: 'tel:01700005600',
            actionLabel: 'Call',
            copy: true,
          },
          { id: 'email', icon: Mail, label: 'Email', value: 'a@example.org' },
        ]}
      />,
    );
    expect(screen.getByRole('link', { name: 'Call' })).toHaveAttribute('href', 'tel:01700005600');
    expect(screen.getByRole('button', { name: 'Copy Mobile' })).toBeInTheDocument();
    expect(screen.getAllByRole('link')).toHaveLength(1);
    await expectNoAxeViolations(container);
  });
});
