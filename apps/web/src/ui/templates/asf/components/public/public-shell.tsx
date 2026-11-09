import type { PublicShellProps } from '@/ui/contract';

import { useState } from 'react';
import { Link, NavLink } from 'react-router';

import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';

import { Icon } from '../icon';
import { useLabels } from '../labels';
import { SurfaceContext } from '../surface-context';

// ----------------------------------------------------------------------

const linkSx = {
  position: 'relative',
  py: 1,
  color: 'text.primary',
  textDecoration: 'none',
  typography: 'body2',
  fontWeight: 600,
  whiteSpace: 'nowrap',
  '&:hover': { color: 'primary.main' },
  '&.active': { color: 'primary.main' },
  '&.active::after': { content: '""', position: 'absolute', left: 0, right: 0, bottom: 2, height: 2, borderRadius: 1, bgcolor: 'primary.main' },
} as const;

function Logo({ brand, inverse }: { brand: PublicShellProps['brand']; inverse?: boolean }) {
  return (
    <Box component={Link} to="/" sx={{ display: 'flex', alignItems: 'center', gap: 1, textDecoration: 'none', color: inverse ? 'common.white' : 'primary.main', flexShrink: 0 }}>
      {brand.logoSrc ? (
        <Box component="img" src={brand.logoSrc} alt={brand.name} sx={{ height: 44, width: 'auto' }} />
      ) : (
        <Box sx={{ typography: 'h6', fontWeight: 800 }}>{brand.name}</Box>
      )}
    </Box>
  );
}

/** A public site: a floating top bar over the page, the content, and a dark footer. */
export function PublicShell({ children, brand, navigation, actions, footer }: PublicShellProps) {
  const labels = useLabels();
  const [open, setOpen] = useState(false);

  return (
    <SurfaceContext.Provider value="public">
      <Box
        sx={{
          minHeight: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          bgcolor: 'background.default',
          // Public pages put fields on coloured bands; a solid field keeps the text readable there.
          '& .MuiOutlinedInput-root, & .MuiPickersOutlinedInput-root': { bgcolor: 'background.paper' },
        }}
      >
        <Box component="header" sx={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: (t) => t.zIndex.appBar, px: { xs: 1.5, md: 4 }, pt: { xs: 1.5, md: 2 } }}>
          <Box
            sx={(t) => ({
              maxWidth: 1400,
              mx: 'auto',
              display: 'flex',
              alignItems: 'center',
              gap: { xs: 1, md: 3 },
              px: { xs: 1.5, md: 3 },
              py: 1.25,
              borderRadius: 2,
              bgcolor: 'rgba(var(--asf-palette-background-paperChannel) / 0.94)',
              backdropFilter: 'blur(10px)',
              boxShadow: '0 8px 24px -8px rgba(0 0 0 / 0.24)',
              ...t.applyStyles('dark', { boxShadow: '0 8px 24px -8px rgba(0 0 0 / 0.6)' }),
            })}
          >
            <Logo brand={brand} />
            <Box component="nav" aria-label={labels.mainNavigation} sx={{ display: { xs: 'none', lg: 'flex' }, flex: 1, justifyContent: 'center', gap: 3.5 }}>
              {navigation.map((item) => (
                <Box key={item.to} component={NavLink} to={item.to} end={item.to === '/'} sx={linkSx}>
                  {item.label}
                </Box>
              ))}
            </Box>
            <Box sx={{ flex: { xs: 1, lg: 'none' } }} />
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>{actions}</Box>
            <IconButton aria-label={labels.openNavigation} onClick={() => setOpen(true)} sx={{ display: { lg: 'none' }, color: 'text.primary' }}>
              <Icon name="menu" />
            </IconButton>
          </Box>
        </Box>

        <Drawer anchor="right" open={open} onClose={() => setOpen(false)} slotProps={{ paper: { sx: { width: 'min(320px, 100vw)', p: 2 } } }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
            <Logo brand={brand} />
            <IconButton aria-label={labels.closeNavigation} onClick={() => setOpen(false)}>
              <Icon name="close" size={20} />
            </IconButton>
          </Box>
          <Box component="nav" aria-label={labels.mainNavigation} sx={{ display: 'grid', gap: 0.5 }}>
            {navigation.map((item) => (
              <Box
                key={item.to}
                component={NavLink}
                to={item.to}
                end={item.to === '/'}
                onClick={() => setOpen(false)}
                sx={{ px: 1.5, py: 1.25, borderRadius: 1, color: 'text.primary', textDecoration: 'none', fontWeight: 600, '&.active': { color: 'primary.main', bgcolor: 'rgba(var(--asf-palette-primary-mainChannel) / 0.08)' } }}
              >
                {item.label}
              </Box>
            ))}
          </Box>
        </Drawer>

        <Box component="main" sx={{ flex: 1 }}>
          {children}
        </Box>

        {footer && (
          <Box
            component="footer"
            sx={(t) => ({
              color: 'rgba(255 255 255 / 0.8)',
              bgcolor: `color-mix(in srgb, ${t.vars.palette.primary.darker} 55%, #000)`,
              pt: { xs: 7, md: 10 },
              pb: 4,
              px: 2,
            })}
          >
            <Box sx={{ maxWidth: 1080, mx: 'auto', display: 'grid', gap: 5, gridTemplateColumns: { xs: '1fr', md: `minmax(0, 1.4fr) repeat(${footer.columns?.length ?? 0}, minmax(0, 1fr))` } }}>
              <Box sx={{ display: 'grid', gap: 2, alignContent: 'start' }}>
                <Logo brand={brand} inverse />
                {footer.about && <Box sx={{ typography: 'body2', maxWidth: '42ch' }}>{footer.about}</Box>}
                {footer.social && footer.social.length > 0 && (
                  <Box component="ul" aria-label={labels.socialLinks} sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                    {footer.social.map((link) => (
                      <li key={link.href}>
                        <Box
                          component="a"
                          href={link.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, px: 1.5, py: 0.75, borderRadius: 5, typography: 'caption', fontWeight: 600, color: 'common.white', textDecoration: 'none', border: '1px solid rgba(255 255 255 / 0.24)', '&:hover': { bgcolor: 'rgba(255 255 255 / 0.08)' } }}
                        >
                          {link.label}
                          <Icon name="external" size={14} />
                        </Box>
                      </li>
                    ))}
                  </Box>
                )}
              </Box>
              {footer.columns?.map((column) => (
                <Box key={column.title} component="nav" aria-label={column.title}>
                  <Box component="h2" sx={{ m: 0, mb: 2, typography: 'subtitle1', color: 'common.white' }}>
                    {column.title}
                  </Box>
                  <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1.25 }}>
                    {column.links.map((link) => (
                      <li key={link.to}>
                        <Box component={Link} to={link.to} sx={{ color: 'inherit', textDecoration: 'none', typography: 'body2', '&:hover': { color: 'common.white', textDecoration: 'underline' } }}>
                          {link.label}
                        </Box>
                      </li>
                    ))}
                  </Box>
                </Box>
              ))}
            </Box>
            <Box sx={{ maxWidth: 1080, mx: 'auto', mt: 6, pt: 3, borderTop: '1px solid rgba(255 255 255 / 0.12)', typography: 'caption', textAlign: 'center' }}>{footer.copyright}</Box>
          </Box>
        )}
      </Box>
    </SurfaceContext.Provider>
  );
}
