import type { TabsProps, LinkTabsProps } from '@/ui/contract';

import { Link as RouterLink } from 'react-router';
import { useId, useRef, useState, useEffect } from 'react';

import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import Tab from '@mui/material/Tab';
import MuiTabs from '@mui/material/Tabs';

import { Icon } from './icon';
import { appPath } from './shared';

// ----------------------------------------------------------------------

/**
 * Tabs with their panels. "underline" (a record's sections) scrolls sideways on phones;
 * "segmented" (views of one list) shares the width evenly.
 */
export function Tabs({ label, items, value, onChange, variant = 'underline' }: TabsProps) {
  const id = useId();
  const [own, setOwn] = useState(items[0]?.value ?? '');
  const current = items.some((item) => item.value === (value ?? own)) ? (value ?? own) : (items[0]?.value ?? '');
  const select = (next: string) => {
    if (value === undefined) setOwn(next);
    onChange?.(next);
  };
  const segmented = variant === 'segmented';
  const active = items.find((item) => item.value === current);

  return (
    <Box>
      <MuiTabs
        aria-label={label}
        value={current}
        onChange={(_, next: string) => select(next)}
        variant={segmented ? 'fullWidth' : 'scrollable'}
        scrollButtons={segmented ? false : 'auto'}
        allowScrollButtonsMobile={!segmented}
        sx={(theme) =>
          segmented
            ? {
                minHeight: 0,
                p: 0.5,
                borderRadius: 1.5,
                bgcolor: 'grey.200',
                ...theme.applyStyles('dark', { bgcolor: 'rgba(145 158 171 / 0.12)' }),
                '& .MuiTabs-indicator': { display: 'none' },
                '& .MuiTab-root': {
                  minHeight: 40,
                  mr: 0,
                  px: 2,
                  borderRadius: 1,
                  transition: 'background-color 150ms, box-shadow 150ms',
                },
                '& .MuiTab-root.Mui-selected': {
                  bgcolor: 'background.paper',
                  boxShadow: '0 1px 2px 0 rgba(145 158 171 / 0.24)',
                  ...theme.applyStyles('dark', { bgcolor: 'grey.700' }),
                },
              }
            : { borderBottom: 1, borderColor: 'divider' }
        }
      >
        {items.map((item) => (
          <Tab
            key={item.value}
            value={item.value}
            label={
              item.count === undefined ? (
                item.label
              ) : (
                <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
                  {item.label}{' '}
                  <Box
                    component="span"
                    sx={(theme) => ({
                      minWidth: 24,
                      px: 0.75,
                      borderRadius: 0.75,
                      typography: 'caption',
                      fontWeight: 700,
                      lineHeight: '22px',
                      fontVariantNumeric: 'tabular-nums',
                      bgcolor: 'grey.200',
                      color: 'grey.800',
                      ...theme.applyStyles('dark', { bgcolor: 'grey.700', color: 'common.white' }),
                    })}
                  >
                    {item.count}
                  </Box>
                </Box>
              )
            }
            id={`${id}-tab-${item.value}`}
            aria-controls={`${id}-panel-${item.value}`}
            icon={item.icon ? <Icon name={item.icon} size={20} /> : undefined}
          />
        ))}
      </MuiTabs>
      {active && (
        <Box
          role="tabpanel"
          id={`${id}-panel-${active.value}`}
          aria-labelledby={`${id}-tab-${active.value}`}
          tabIndex={0}
          sx={{ pt: 3, '&:focus-visible': { outlineOffset: 4 } }}
        >
          {active.content}
        </Box>
      )}
    </Box>
  );
}

/**
 * Tabs that are links to a record's pages: the underline look of `Tabs` on a navigation of links,
 * the current page marked for screen readers and by the line under it. On a narrow screen the row
 * scrolls sideways and keeps the current tab in view.
 */
export function LinkTabs({ label, items }: LinkTabsProps) {
  const rowRef = useRef<HTMLUListElement | null>(null);
  const currentRef = useRef<HTMLAnchorElement | null>(null);
  const currentTo = items.find((item) => item.current)?.to;
  useEffect(() => {
    // the row alone scrolls, never the page, so a tab opened from a link keeps the page at its top
    const row = rowRef.current;
    const link = currentRef.current;
    if (!row || !link) return;
    row.scrollLeft = Math.max(0, link.offsetLeft - (row.clientWidth - link.offsetWidth) / 2);
  }, [currentTo]);

  return (
    <Box component="nav" aria-label={label}>
      <Box
        component="ul"
        ref={rowRef}
        sx={{
          position: 'relative',
          display: 'flex',
          gap: { xs: 3, md: 5 },
          m: 0,
          px: { xs: 1, md: 0 },
          listStyle: 'none',
          overflowX: 'auto',
          scrollbarWidth: 'none',
          '&::-webkit-scrollbar': { display: 'none' },
        }}
      >
        {items.map((item) => {
          const to = appPath(item.to);
          if (!to) return null;
          return (
            <Box component="li" key={item.to} sx={{ flex: 'none' }}>
              <Link
                component={RouterLink}
                to={to}
                ref={item.current ? currentRef : undefined}
                aria-current={item.current ? 'page' : undefined}
                underline="none"
                sx={{
                  position: 'relative',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 1,
                  minHeight: 48,
                  whiteSpace: 'nowrap',
                  typography: 'body2',
                  fontWeight: 600,
                  color: item.current ? 'text.primary' : 'text.secondary',
                  '&:hover': { color: 'text.primary' },
                  // inside the row that scrolls sideways, so the ring is drawn within the link
                  '&:focus-visible': { outlineOffset: -2 },
                  '&::after': {
                    content: '""',
                    position: 'absolute',
                    insetInline: 0,
                    bottom: 0,
                    height: 2,
                    bgcolor: item.current ? 'text.primary' : 'transparent',
                  },
                }}
              >
                {item.icon && <Icon name={item.icon} size={20} />}
                {item.label}
              </Link>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
