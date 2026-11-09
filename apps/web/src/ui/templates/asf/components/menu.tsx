import type { MenuProps } from '@/ui/contract';

import { useId, useState } from 'react';
import { Link as RouterLink } from 'react-router';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import MuiMenu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import IconButton from '@mui/material/IconButton';
import ListItemIcon from '@mui/material/ListItemIcon';

import { Icon } from './icon';

// ----------------------------------------------------------------------

/** A button that opens a list of links and actions, for a row's or a profile's choices. */
export function Menu({ label, items, children }: MenuProps) {
  const menuId = useId();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const open = Boolean(anchor);
  const close = () => setAnchor(null);
  const trigger = {
    'aria-label': label,
    'aria-haspopup': 'true' as const,
    'aria-expanded': open,
    'aria-controls': open ? menuId : undefined,
    onClick: (event: React.MouseEvent<HTMLElement>) => setAnchor(event.currentTarget),
  };
  return (
    <>
      {children ? (
        <Button color="inherit" endIcon={<Icon name="chevron-down" size={18} />} {...trigger}>
          {children}
        </Button>
      ) : (
        <IconButton {...trigger}>
          <Icon name="more" size={20} />
        </IconButton>
      )}
      <MuiMenu id={menuId} anchorEl={anchor} open={open} onClose={close} slotProps={{ list: { 'aria-label': label } }}>
        {items.map((item) => {
          const look = {
            disabled: item.disabled,
            sx: item.tone === 'danger' ? { color: 'error.main' } : undefined,
          };
          const content = (
            <>
              {item.icon && (
                <ListItemIcon sx={{ color: 'inherit' }}>
                  <Icon name={item.icon} size={20} />
                </ListItemIcon>
              )}
              <Box component="span">{item.label}</Box>
            </>
          );
          return item.to ? (
            <MenuItem key={item.id} component={RouterLink} to={item.to} onClick={close} {...look}>
              {content}
            </MenuItem>
          ) : (
            <MenuItem
              key={item.id}
              onClick={() => {
                close();
                item.onSelect?.();
              }}
              {...look}
            >
              {content}
            </MenuItem>
          );
        })}
      </MuiMenu>
    </>
  );
}
