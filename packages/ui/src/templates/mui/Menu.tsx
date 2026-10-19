import MuiMenu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { useId, useRef, useState } from 'react';
import { Icon } from '../../components/Icon/Icon.js';
import type { MenuAction, MenuButtonProps } from '../../contract.js';
import { cx } from '../../utils/cx.js';
import { insideDialog } from './portal.js';
import { RouterLink } from './provider.js';

function ItemContent({ item }: { item: MenuAction }) {
  return (
    <>
      {item.icon && <Icon icon={item.icon} size="sm" />}
      <span>{item.label}</span>
    </>
  );
}

/**
 * A button that opens a menu of links and actions on MUI's menu (the APG menu button pattern:
 * Enter, Space and the arrow keys, Escape returns focus): the profile menu of the app bar and the
 * row menus of the bulk lists. Links go through the app's router.
 */
export function MenuButton({ label, items, children, icon, className }: MenuButtonProps) {
  const button = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const close = () => setOpen(false);
  return (
    <>
      <button
        ref={button}
        type="button"
        aria-label={label}
        aria-haspopup="true"
        aria-expanded={open || undefined}
        aria-controls={open ? menuId : undefined}
        className={cx('ui-btn', 'ui-btn-ghost', 'ui-menu-button', className)}
        onClick={() => setOpen((now) => !now)}
      >
        {icon && <Icon icon={icon} size="md" />}
        {children}
      </button>
      <MuiMenu
        id={menuId}
        anchorEl={() => button.current!}
        open={open}
        onClose={close}
        // inside a dialog the menu renders in it, so the dialog's modality never hides it
        container={() => insideDialog(button.current)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{
          paper: { className: 'ui-popover ui-menu-popover' },
          list: { className: 'ui-menu', 'aria-label': label },
        }}
      >
        {items.map((item) =>
          item.href ? (
            <MenuItem
              key={item.id}
              component={RouterLink}
              href={item.href}
              className="ui-menu-item"
              disableRipple
              onClick={close}
            >
              <ItemContent item={item} />
            </MenuItem>
          ) : (
            <MenuItem
              key={item.id}
              className="ui-menu-item"
              disableRipple
              onClick={() => {
                close();
                item.onAction?.();
              }}
            >
              <ItemContent item={item} />
            </MenuItem>
          ),
        )}
      </MuiMenu>
    </>
  );
}
