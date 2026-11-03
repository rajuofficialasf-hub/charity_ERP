import type { Theme } from '@mui/material/styles';
import type { FilterBarProps } from '@/ui/contract';

import { useId, useRef, useState, useEffect } from 'react';

import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Badge from '@mui/material/Badge';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import useMediaQuery from '@mui/material/useMediaQuery';
import InputAdornment from '@mui/material/InputAdornment';

import { Icon } from './icon';
import { Drawer } from './drawer';
import { fill, useLabels } from './labels';

// ----------------------------------------------------------------------

const fieldsSx = {
  display: 'grid',
  gap: 2,
  gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', md: 'repeat(auto-fit, minmax(180px, 1fr))' },
  alignItems: 'start',
} as const;

/**
 * Waits until typing stops, then hands over the term, or '' while it is shorter than 2 characters;
 * only a term that differs from the last one sent, so nothing is sent on load.
 */
function useSearch(onSearch: ((term: string) => void) | undefined, initial = '') {
  const [term, setTerm] = useState(initial);
  const latest = useRef(onSearch);
  const sent = useRef(initial.trim().length >= 2 ? initial.trim() : '');
  useEffect(() => {
    latest.current = onSearch;
  });
  useEffect(() => {
    const next = term.trim().length >= 2 ? term.trim() : '';
    if (!latest.current || next === sent.current) return undefined;
    const timer = setTimeout(() => {
      sent.current = next;
      latest.current?.(next);
    }, 300);
    return () => clearTimeout(timer);
  }, [term]);
  return [term, setTerm] as const;
}

/**
 * Filter fields in one row on wide screens, behind a filters button in a panel on phones, with an
 * optional search box first, one-tap status chips and the filters in force as removable chips.
 */
export function FilterBar({
  children,
  label,
  onSearch,
  initialSearch,
  searchPlaceholder,
  chips,
  activeChip,
  onChipChange,
  activeFilters,
  onClearFilters,
  collapsible,
}: FilterBarProps) {
  const labels = useLabels();
  const phone = useMediaQuery((theme: Theme) => theme.breakpoints.down('sm'), { noSsr: true });
  const [term, setTerm] = useSearch(onSearch, initialSearch);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const panelId = useId();
  const searchName = searchPlaceholder ?? labels.search;
  const activeCount = activeFilters?.length ?? 0;
  const behindButton = Boolean(children) && (phone || collapsible);
  const buttonName = activeCount > 0 ? `${labels.filters} (${fill(labels.filtersActive, { count: activeCount })})` : labels.filters;

  return (
    <Box role="group" aria-label={label ?? labels.filters} sx={{ display: 'grid', gap: 2 }}>
      {(onSearch || behindButton) && (
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
          {onSearch && (
            <TextField
              type="search"
              size="small"
              value={term}
              placeholder={searchName}
              onChange={(event) => setTerm(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Escape' || term === '') return;
                event.preventDefault();
                setTerm('');
              }}
              sx={{ flex: 1, maxWidth: { md: 360 } }}
              slotProps={{
                htmlInput: { 'aria-label': searchName },
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <Icon name="search" size={20} />
                    </InputAdornment>
                  ),
                },
              }}
            />
          )}
          {behindButton && (
            <Button
              variant="outlined"
              color="inherit"
              aria-label={buttonName}
              aria-expanded={phone ? undefined : panelOpen}
              aria-controls={!phone && panelOpen ? panelId : undefined}
              onClick={() => (phone ? setSheetOpen(true) : setPanelOpen((open) => !open))}
              startIcon={
                <Badge badgeContent={activeCount} color="primary" invisible={activeCount === 0}>
                  <Icon name="filter" size={20} />
                </Badge>
              }
              sx={{ flexShrink: 0, ml: onSearch ? 0 : 'auto' }}
            >
              {labels.filters}
            </Button>
          )}
        </Box>
      )}

      {children && !behindButton && <Box sx={fieldsSx}>{children}</Box>}
      {children && collapsible && !phone && panelOpen && (
        <Box id={panelId} sx={{ ...fieldsSx, p: 2, borderRadius: 1.5, border: 1, borderColor: 'divider' }}>
          {children}
        </Box>
      )}

      {chips && chips.length > 0 && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {chips.map((chip) => {
            const pressed = chip.id === activeChip;
            return (
              <Chip
                key={chip.id}
                clickable
                aria-pressed={pressed}
                color={pressed ? 'primary' : 'default'}
                variant={pressed ? 'filled' : 'outlined'}
                onClick={() => onChipChange?.(chip.id)}
                label={
                  <>
                    {chip.label}
                    {chip.count !== undefined && ' '}
                    {chip.count !== undefined && (
                      <Box component="span" sx={{ ml: 0.5, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                        {chip.count}
                      </Box>
                    )}
                  </>
                }
              />
            );
          })}
        </Box>
      )}

      {activeFilters && activeFilters.length > 0 && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
          <Box component="ul" aria-label={labels.filters} sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, m: 0, p: 0, listStyle: 'none' }}>
            {activeFilters.map((filter) => (
              <Box
                component="li"
                key={filter.id}
                sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25, pl: 1.25, pr: 0.25, borderRadius: 1, typography: 'body2', bgcolor: 'rgba(var(--asf-palette-primary-mainChannel) / 0.12)' }}
              >
                <span>{filter.label}</span>
                <IconButton size="small" aria-label={fill(labels.removeFilter, { label: filter.label })} onClick={filter.onRemove}>
                  <Icon name="close" size={16} />
                </IconButton>
              </Box>
            ))}
          </Box>
          {onClearFilters && (
            <Button size="small" color="inherit" onClick={onClearFilters}>
              {labels.clearAll}
            </Button>
          )}
        </Box>
      )}

      {children && phone && (
        <Drawer
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          title={labels.filters}
          actions={
            <>
              {onClearFilters && (
                <Button variant="outlined" color="inherit" onClick={onClearFilters}>
                  {labels.clearFilters}
                </Button>
              )}
              <Button variant="contained" onClick={() => setSheetOpen(false)}>
                {labels.applyFilters}
              </Button>
            </>
          }
        >
          <Box sx={{ display: 'grid', gap: 2 }}>{children}</Box>
        </Drawer>
      )}
    </Box>
  );
}
