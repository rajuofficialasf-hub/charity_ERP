import type { Crumb, PageExtendedProps } from '@/ui/contract';

import { Link } from 'react-router';

import Box from '@mui/material/Box';

import { Icon } from './icon';
import { useLabels } from './labels';
import { APP_NAME } from '../config';

// ----------------------------------------------------------------------

/** The trail to this page, dot separated. The last step is the current page, so it is not a link. */
function Breadcrumbs({ items }: { items: readonly Crumb[] }) {
  const labels = useLabels();
  return (
    <Box component="nav" aria-label={labels.breadcrumb}>
      <Box component="ol" sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexWrap: 'wrap', alignItems: 'center', typography: 'body2' }}>
        {items.map((crumb, index) => {
          const last = index === items.length - 1;
          return (
            <Box
              component="li"
              key={`${crumb.label}-${index}`}
              aria-current={last ? 'page' : undefined}
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                color: last ? 'text.disabled' : 'text.primary',
                '&:not(:first-of-type)::before': {
                  content: '""',
                  width: 4,
                  height: 4,
                  mx: 1.5,
                  borderRadius: '50%',
                  bgcolor: 'text.disabled',
                },
              }}
            >
              {crumb.to && !last ? (
                <Box component={Link} to={crumb.to} sx={{ color: 'inherit', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}>
                  {crumb.label}
                </Box>
              ) : (
                crumb.label
              )}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

export function Page({ title, description, actions, children, breadcrumbs, back }: PageExtendedProps) {
  return (
    <>
      <title>{title === APP_NAME ? title : `${title} | ${APP_NAME}`}</title>
      {back && (
        <Box
          component={Link}
          to={back.to}
          sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, mb: 2, typography: 'subtitle2', color: 'text.primary', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
        >
          <Icon name="chevron-left" size={16} />
          {back.label}
        </Box>
      )}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', flexWrap: 'wrap', gap: 2, mb: { xs: 3, md: 5 } }}>
        <Box sx={{ flex: '1 1 320px', minWidth: 0 }}>
          <Box component="h1" sx={{ m: 0, typography: 'h4', textWrap: 'balance' }}>
            {title}
          </Box>
          {description && (
            <Box component="p" sx={{ m: 0, mt: 1, typography: 'body2', color: 'text.secondary', maxWidth: '70ch' }}>
              {description}
            </Box>
          )}
          {breadcrumbs && breadcrumbs.length > 0 && (
            <Box sx={{ mt: 2 }}>
              <Breadcrumbs items={breadcrumbs} />
            </Box>
          )}
        </Box>
        {actions && <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, alignItems: 'center' }}>{actions}</Box>}
      </Box>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>{children}</Box>
    </>
  );
}
