import type { AccountMenuProps } from '@/ui/contract';

import { useState } from 'react';
import { Link } from 'react-router';

import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';

import { Icon } from './icon';
import { Avatar } from './display';
import { useLabels } from './labels';

// ----------------------------------------------------------------------

/** The header's avatar button and the panel it opens: who is signed in, their links, sign out. */
export function AccountMenu({ user, links = [], onSignOut, signOutLabel }: AccountMenuProps) {
  const labels = useLabels();
  const [open, setOpen] = useState(false);
  return (
    <>
      <IconButton
        aria-label={user.name}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        sx={{ p: 0.25, ml: 0.5, background: (t) => `conic-gradient(${t.vars.palette.primary.light}, ${t.vars.palette.info.light}, ${t.vars.palette.primary.light})` }}
      >
        <Box sx={{ borderRadius: '50%', p: '2px', bgcolor: 'background.default', display: 'flex' }}>
          <Avatar name={user.name} src={user.avatarSrc} size="small" decorative />
        </Box>
      </IconButton>
      <Drawer
        anchor="right"
        open={open}
        onClose={() => setOpen(false)}
        slotProps={{ paper: { 'aria-label': user.name, sx: { width: 'min(320px, 100vw)', display: 'flex' } } }}
      >
        <IconButton aria-label={labels.close} onClick={() => setOpen(false)} sx={{ position: 'absolute', top: 12, left: 12 }}>
          <Icon name="close" size={20} />
        </IconButton>
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', px: 3, pt: 7, pb: 3 }}>
          <Avatar name={user.name} src={user.avatarSrc} size="xlarge" decorative />
          <Box sx={{ typography: 'subtitle1', mt: 2 }}>{user.name}</Box>
          {user.email && <Box sx={{ typography: 'body2', color: 'text.secondary', overflowWrap: 'anywhere' }}>{user.email}</Box>}
        </Box>
        {links.length > 0 && (
          <Box component="nav" aria-label={labels.accountLinks}>
          <Box component="ul" sx={{ listStyle: 'none', m: 0, px: 2, py: 2, borderTop: '1px dashed', borderColor: 'divider', display: 'grid', gap: 0.5 }}>
            {links.map((link) => (
              <li key={link.to}>
                <Box
                  component={Link}
                  to={link.to}
                  onClick={() => setOpen(false)}
                  sx={{ display: 'flex', alignItems: 'center', gap: 2, px: 1.5, py: 1.25, borderRadius: 1, color: 'text.secondary', textDecoration: 'none', typography: 'body2', fontWeight: 500, '&:hover': { bgcolor: 'action.hover', color: 'text.primary' } }}
                >
                  {link.icon && <Icon name={link.icon} />}
                  {link.label}
                </Box>
              </li>
            ))}
          </Box>
          </Box>
        )}
        <Box sx={{ flex: 1 }} />
        {onSignOut && (
          <Box sx={{ p: 2.5 }}>
            <Button
              fullWidth
              size="large"
              color="error"
              onClick={() => {
                setOpen(false);
                onSignOut();
              }}
              sx={{ bgcolor: 'rgba(var(--asf-palette-error-mainChannel) / 0.1)', '&:hover': { bgcolor: 'rgba(var(--asf-palette-error-mainChannel) / 0.18)' } }}
            >
              {signOutLabel ?? labels.signOut}
            </Button>
          </Box>
        )}
      </Drawer>
    </>
  );
}
