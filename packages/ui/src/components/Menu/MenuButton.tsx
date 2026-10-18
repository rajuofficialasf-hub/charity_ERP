'use client';

import type { ReactNode } from 'react';
import { Button as AriaButton, Menu, MenuItem, MenuTrigger, Popover } from 'react-aria-components';
import { cx } from '../../utils/cx.js';
import { Icon, type IconComponent } from '../Icon/Icon.js';

export interface MenuAction {
  id: string;
  label: string;
  icon?: IconComponent;
  /** A link to another page; the menu closes on navigation. */
  href?: string;
  /** An action instead of a link (log out). */
  onAction?: () => void;
}

export interface MenuButtonProps {
  /** Accessible name of the button and its menu ("profile menu"). */
  label: string;
  items: MenuAction[];
  /** What the button shows (the person's name); only the icon when left out. */
  children?: ReactNode;
  /** The icon of the button; a person by default in the app bar. */
  icon?: IconComponent;
  className?: string;
}

/**
 * A button that opens a menu of links and actions on the APG menu button pattern (Enter, Space
 * and arrow keys, Escape returns focus): the profile menu of the app bar (DESIGN_SYSTEM 4.1).
 */
export function MenuButton({ label, items, children, icon, className }: MenuButtonProps) {
  return (
    <MenuTrigger>
      <AriaButton
        aria-label={label}
        className={cx('ui-btn', 'ui-btn-ghost', 'ui-menu-button', className)}
      >
        {icon && <Icon icon={icon} size="md" />}
        {children}
      </AriaButton>
      <Popover className="ui-popover ui-menu-popover" placement="bottom end">
        <Menu className="ui-menu" aria-label={label}>
          {items.map((item) => (
            <MenuItem
              key={item.id}
              id={item.id}
              className="ui-menu-item"
              textValue={item.label}
              {...(item.href ? { href: item.href } : {})}
              {...(item.onAction ? { onAction: item.onAction } : {})}
            >
              {item.icon && <Icon icon={item.icon} size="sm" />}
              <span>{item.label}</span>
            </MenuItem>
          ))}
        </Menu>
      </Popover>
    </MenuTrigger>
  );
}
