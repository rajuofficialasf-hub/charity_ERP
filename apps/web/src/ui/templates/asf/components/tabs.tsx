import type { TabsProps } from '@/ui/contract';

import { useId, useState } from 'react';

import Box from '@mui/material/Box';
import Tab from '@mui/material/Tab';
import MuiTabs from '@mui/material/Tabs';

import { Icon } from './icon';

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
            label={item.label}
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
