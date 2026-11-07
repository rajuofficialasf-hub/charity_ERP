import type { ReactNode } from 'react';
import type { Tone, ToastApi, ToastOptions } from '@/ui/contract';

import { useMemo, useState, useEffect, useCallback } from 'react';

import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import { alpha } from '@mui/material/styles';
import IconButton from '@mui/material/IconButton';

import { Icon } from './icon';
import { useLabels } from './labels';
import { ToastContext } from './toast-context';

// ----------------------------------------------------------------------

type Toast = { id: number; message: string; tone: Tone };

const TONE_ICON = { info: 'info', success: 'success', warning: 'warning', error: 'error' } as const;
const SHOW_MS = 5000;

let nextId = 1;

// onClose is the provider's stable remove, so a new toast doesn't restart the others' timers.
function ToastItem({ toast, onClose }: { toast: Toast; onClose: (id: number) => void }) {
  const labels = useLabels();
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return undefined;
    const timer = window.setTimeout(() => onClose(toast.id), SHOW_MS);
    return () => window.clearTimeout(timer);
  }, [paused, onClose, toast.id]);

  return (
    <Paper
      role={toast.tone === 'error' ? 'alert' : 'status'}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      sx={(theme) => ({
        pointerEvents: 'auto',
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        width: 'min(360px, calc(100vw - 32px))',
        p: 1,
        pr: 0.5,
        borderRadius: 1.5,
        boxShadow: `0 0 2px 0 ${alpha(theme.palette.grey[500], 0.24)}, -20px 20px 40px -4px ${alpha(theme.palette.grey[500], 0.24)}`,
        animation: 'asf-toast-in 200ms cubic-bezier(0.16, 1, 0.3, 1)',
        '@keyframes asf-toast-in': { from: { opacity: 0, transform: 'translateY(-8px)' } },
      })}
    >
      <Box
        sx={(theme) => ({
          display: 'grid',
          placeItems: 'center',
          width: 48,
          height: 48,
          flexShrink: 0,
          borderRadius: 1.5,
          color: theme.vars.palette[toast.tone].main,
          bgcolor: alpha(theme.palette[toast.tone].main, 0.08),
        })}
      >
        <Icon name={TONE_ICON[toast.tone]} />
      </Box>
      <Box sx={{ flex: 1, typography: 'subtitle2', py: 1 }}>{toast.message}</Box>
      <IconButton size="small" aria-label={labels.dismiss} onClick={() => onClose(toast.id)}>
        <Icon name="close" size={18} />
      </IconButton>
    </Paper>
  );
}

/** Holds the toasts and shows them in the top right corner, newest first. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const remove = useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), []);

  const api = useMemo<ToastApi>(() => {
    const show = (message: string, options?: ToastOptions) =>
      setToasts((list) => [{ id: nextId++, message, tone: options?.tone ?? 'info' }, ...list].slice(0, 4));
    return {
      show,
      success: (message) => show(message, { tone: 'success' }),
      error: (message) => show(message, { tone: 'error' }),
    };
  }, []);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <Box
        sx={{
          position: 'fixed',
          // Below the 72px header, so its buttons stay usable while a toast shows.
          top: 80,
          right: 16,
          zIndex: (theme) => theme.zIndex.snackbar,
          display: 'flex',
          flexDirection: 'column',
          gap: 1,
          pointerEvents: 'none',
        }}
      >
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onClose={remove} />
        ))}
      </Box>
    </ToastContext.Provider>
  );
}
