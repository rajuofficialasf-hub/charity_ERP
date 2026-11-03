// @vitest-environment jsdom
// The people and profile pieces this app added to the asf template (listed in local.json): the icon
// tile, the person cell, the copy button, the profile banner, its sections and the contact list.
import '@testing-library/jest-dom/vitest';

import type { ReactNode } from 'react';

import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { vi, it, expect, describe, afterEach, beforeEach } from 'vitest';
import { render, screen, within, cleanup } from '@testing-library/react';

import { resetPage, stubWidth, expectNoAxeViolations } from './local-test-support';
import { IconTile, UiProvider, CopyButton, PersonCell, ContactList, ProfileBanner, ProfileSection } from './index';

beforeEach(() => stubWidth(false));

afterEach(() => {
  cleanup();
  resetPage();
});

function renderInApp(ui: ReactNode) {
  const router = createMemoryRouter(
    [
      { path: '/volunteers/7', element: <h1>Amina&apos;s profile</h1> },
      { path: '*', element: ui },
    ],
    { initialEntries: ['/'] }
  );
  return render(
    <UiProvider>
      <RouterProvider router={router} />
    </UiProvider>
  );
}

/** A clipboard that accepts or refuses what is written to it. */
function stubClipboard(works: boolean) {
  const writeText = vi.fn(() => (works ? Promise.resolve() : Promise.reject(new Error('denied'))));
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  return writeText;
}

describe('the icon tile and the person cell', () => {
  it('shows a person as their initial, hidden from screen readers beside their name', () => {
    const { container } = render(
      <UiProvider>
        <IconTile name="amina Khatun" tone="primary" />
      </UiProvider>
    );
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
    expect(container).toHaveTextContent('A');
  });

  it('names the row by a link to the person, with a quiet second line', async () => {
    const user = userEvent.setup();
    renderInApp(<PersonCell name="Amina Khatun" to="/volunteers/7" secondary="VOL-0007" />);
    expect(screen.getByText('VOL-0007')).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Amina Khatun' }));
    expect(await screen.findByRole('heading', { name: "Amina's profile" })).toBeInTheDocument();
  });

  it('shows the name as text without a page to open', () => {
    renderInApp(<PersonCell name="Rahim Uddin" />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText('Rahim Uddin')).toBeInTheDocument();
  });
});

describe('the copy button', () => {
  it('copies the value and says so', async () => {
    const user = userEvent.setup();
    const writeText = stubClipboard(true);
    render(
      <UiProvider>
        <CopyButton value="1990123456789" label="NID" />
      </UiProvider>
    );
    await user.click(screen.getByRole('button', { name: 'Copy NID' }));
    expect(writeText).toHaveBeenCalledWith('1990123456789');
    expect(await screen.findByText('NID copied')).toBeInTheDocument();
  });

  it('says when it could not copy', async () => {
    const user = userEvent.setup();
    stubClipboard(false);
    render(
      <UiProvider>
        <CopyButton value="x" label="Mobile" />
      </UiProvider>
    );
    await user.click(screen.getByRole('button', { name: 'Copy Mobile' }));
    expect(await screen.findByText('Mobile could not be copied')).toBeInTheDocument();
  });
});

describe('the profile banner', () => {
  it('heads the page with the name, reads the facts and names the action panel', () => {
    stubClipboard(true);
    render(
      <UiProvider>
        <ProfileBanner
          name="Amina Khatun"
          status={<span>Approved</span>}
          facts={[
            { id: 'nid', label: 'NID', value: '1990123456789', copy: true, icon: 'id-card' },
            { id: 'district', label: 'District', value: 'Dhaka', showLabel: true },
          ]}
          actions={<button type="button">Block</button>}
        />
      </UiProvider>
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Amina Khatun' })).toBeInTheDocument();
    expect(screen.getByText('Approved')).toBeInTheDocument();
    const facts = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(facts[0]).toHaveTextContent('NID');
    expect(facts[0]).toHaveTextContent('1990123456789');
    expect(within(facts[0]!).getByRole('button', { name: 'Copy NID' })).toBeInTheDocument();
    expect(facts[1]).toHaveTextContent('District: Dhaka');
    expect(within(screen.getByRole('region', { name: 'Actions' })).getByRole('button', { name: 'Block' })).toBeInTheDocument();
  });

  it('takes a lower heading under the page title', () => {
    render(
      <UiProvider>
        <ProfileBanner name="Rahim Uddin" headingLevel={2} />
      </UiProvider>
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Rahim Uddin' })).toBeInTheDocument();
  });
});

describe('the profile section', () => {
  it('opens and closes by its title, its edit button beside it', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    render(
      <UiProvider>
        <ProfileSection title="Contact" icon="phone" action={<button type="button" onClick={onEdit}>Edit contact</button>}>
          <p>01711000000</p>
        </ProfileSection>
      </UiProvider>
    );
    const toggle = screen.getByRole('button', { name: 'Contact' });
    expect(screen.getByRole('heading', { level: 2, name: 'Contact' })).toContainElement(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('region', { name: 'Contact' })).toHaveTextContent('01711000000');
    await user.click(screen.getByRole('button', { name: 'Edit contact' }));
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('01711000000')).not.toBeVisible();
  });
});

describe('the contact list', () => {
  it('reads each contact with its label, its action and a copy button', () => {
    stubClipboard(true);
    render(
      <UiProvider>
        <ContactList
          items={[
            { id: 'mobile', icon: 'phone', label: 'Mobile', value: '01711000000', href: 'tel:01711000000', actionLabel: 'Call', copy: true },
            { id: 'whatsapp', icon: 'external', label: 'WhatsApp', value: '01711000000', href: 'https://wa.me/8801711000000', actionLabel: 'Message', external: true },
          ]}
        />
      </UiProvider>
    );
    const items = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Mobile');
    expect(within(items[0]!).getByRole('link', { name: 'Call' })).toHaveAttribute('href', 'tel:01711000000');
    expect(within(items[0]!).getByRole('button', { name: 'Copy Mobile' })).toBeInTheDocument();
    const message = within(items[1]!).getByRole('link', { name: /Message/ });
    expect(message).toHaveAttribute('target', '_blank');
    expect(message).toHaveAttribute('rel', 'noopener noreferrer');
  });
});

describe('the people pieces together', () => {
  it.each(['light', 'dark'] as const)('pass axe, %s', async (mode) => {
    window.localStorage.setItem('asf-mode', mode);
    stubClipboard(true);
    const { container } = renderInApp(
      <>
        <ProfileBanner name="Amina Khatun" facts={[{ id: 'nid', label: 'NID', value: '123', copy: true }]} actions={<button type="button">Block</button>} />
        <ProfileSection title="Contact">
          <ContactList items={[{ id: 'm', icon: 'phone', label: 'Mobile', value: '017', href: 'tel:017', actionLabel: 'Call', copy: true }]} />
        </ProfileSection>
        <PersonCell name="Rahim" to="/volunteers/7" secondary="VOL-1" />
        <IconTile icon="users" tone="info" />
      </>
    );
    await expectNoAxeViolations(container);
  });
});
