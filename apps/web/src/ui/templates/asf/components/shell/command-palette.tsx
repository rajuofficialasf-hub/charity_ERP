import type { ExtendedNavGroup } from '@/ui/contract';

import { useNavigate } from 'react-router';
import { useId, useRef, useMemo, useState, useEffect } from 'react';

import Box from '@mui/material/Box';
import Dialog from '@mui/material/Dialog';
import InputBase from '@mui/material/InputBase';
import ButtonBase from '@mui/material/ButtonBase';

import { Icon } from '../icon';
import { Chip } from '../display';
import { useLabels } from '../labels';
import { flattenNav } from './nav-section';

/** The name printed on the Escape key, the same in both languages. */
const ESCAPE_KEY = 'Esc';

// ----------------------------------------------------------------------

const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

/** The header's search button, and ⌘K / Ctrl+K anywhere: find a page by name and go there. */
export function CommandPalette({ navigation }: { navigation: ExtendedNavGroup[] }) {
  const labels = useLabels();
  const navigate = useNavigate();
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  const all = useMemo(() => flattenNav(navigation), [navigation]);
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? all.filter((r) => `${r.label} ${r.trail.join(' ')} ${r.to}`.toLowerCase().includes(q)) : all;
  }, [all, query]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const close = () => {
    setOpen(false);
    setQuery('');
    setCursor(0);
  };
  const go = (to: string) => {
    close();
    navigate(to);
  };

  return (
    <>
      <ButtonBase
        onClick={() => setOpen(true)}
        aria-label={labels.search}
        aria-keyshortcuts={isMac() ? 'Meta+K' : 'Control+K'}
        sx={(theme) => ({
          gap: 1,
          height: 40,
          pl: 1.25,
          pr: { xs: 1.25, sm: 0.75 },
          borderRadius: 1.5,
          color: 'text.secondary',
          bgcolor: 'rgba(var(--asf-neutral-500-channel) / 0.08)',
          '&:hover': { bgcolor: 'rgba(var(--asf-neutral-500-channel) / 0.16)' },
          ...theme.applyStyles('dark', { bgcolor: 'rgba(var(--asf-neutral-500-channel) / 0.12)' }),
        })}
      >
        <Icon name="search" size={20} />
        <Box
          component="kbd"
          sx={{
            display: { xs: 'none', sm: 'inline-flex' },
            px: 0.75,
            py: 0.25,
            borderRadius: 0.75,
            fontFamily: 'inherit',
            fontSize: '0.75rem',
            fontWeight: 700,
            color: 'text.primary',
            bgcolor: 'background.paper',
            boxShadow: '0 1px 2px 0 rgba(var(--asf-neutral-500-channel) / 0.16)',
          }}
        >
          {isMac() ? '⌘K' : 'Ctrl K'}
        </Box>
      </ButtonBase>

      <Dialog
        open={open}
        onClose={close}
        fullWidth
        maxWidth="sm"
        aria-label={labels.search}
        // The dialog moves focus to itself on open; hand it to the input so typing starts at once.
        slotProps={{ paper: { sx: { alignSelf: 'flex-start', mt: { xs: 2, sm: 12 }, overflow: 'hidden' } }, transition: { onEntered: () => input.current?.focus() } }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 3, py: 2, borderBottom: 1, borderColor: 'divider' }}>
          <Box sx={{ color: 'text.disabled', display: 'flex' }}>
            <Icon name="search" />
          </Box>
          <InputBase
            autoFocus
            inputRef={input}
            fullWidth
            placeholder={labels.searchPlaceholder}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setCursor(0);
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                setCursor((c) => Math.min(c + 1, results.length - 1));
              } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                setCursor((c) => Math.max(c - 1, 0));
              } else if (event.key === 'Enter' && results[cursor]) {
                event.preventDefault();
                go(results[cursor].to);
              }
            }}
            inputProps={{
              role: 'combobox',
              'aria-label': labels.search,
              'aria-expanded': true,
              'aria-controls': listId,
              'aria-activedescendant': results[cursor] ? `${listId}-${cursor}` : undefined,
            }}
            sx={{ typography: 'h6', fontWeight: 400 }}
          />
          <Box component="kbd" sx={{ fontFamily: 'inherit', fontSize: '0.75rem', fontWeight: 700, color: 'text.secondary', px: 0.75, borderRadius: 0.75, bgcolor: 'action.hover' }}>
            {ESCAPE_KEY}
          </Box>
        </Box>
        <Box component="ul" id={listId} role="listbox" aria-label={labels.search} sx={{ listStyle: 'none', m: 0, p: 1.5, maxHeight: 420, overflowY: 'auto' }}>
          {results.length === 0 && (
            <Box component="li" sx={{ py: 5, textAlign: 'center', color: 'text.secondary', typography: 'body2' }}>
              {labels.searchEmpty}
            </Box>
          )}
          {results.map((result, index) => (
            <Box
              component="li"
              key={result.to}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === cursor}
              onMouseEnter={() => setCursor(index)}
              onClick={() => go(result.to)}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                px: 2,
                py: 1.25,
                borderRadius: 1,
                cursor: 'pointer',
                borderBottom: '1px dashed',
                borderColor: 'divider',
                '&[aria-selected="true"]': { bgcolor: 'action.hover', borderColor: 'transparent' },
              }}
            >
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box sx={{ typography: 'subtitle2' }}>{result.label}</Box>
                <Box sx={{ typography: 'caption', color: 'text.secondary' }}>{result.to}</Box>
              </Box>
              <Box sx={{ display: { xs: 'none', sm: 'flex' }, gap: 0.5 }}>
                {result.trail.map((step) => (
                  <Chip key={step}>{step}</Chip>
                ))}
              </Box>
            </Box>
          ))}
        </Box>
      </Dialog>
    </>
  );
}
