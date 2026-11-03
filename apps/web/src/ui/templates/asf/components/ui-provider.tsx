import type { UiProviderExtendedProps } from '@/ui/contract';

import { useMemo } from 'react';

import '@fontsource-variable/public-sans';
import '@fontsource-variable/noto-sans-bengali';

import { tokens } from '@/ui/tokens';

import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';

import { ToastProvider } from './toast';
import { LabelsContext, DEFAULT_LABELS } from './labels';
import { createAsfTheme } from '../theme/theme';

// ----------------------------------------------------------------------

const theme = createAsfTheme(tokens);

/** The theme (light, dark or the system's choice), the CSS baseline, date pickers, labels and toasts. */
export function UiProvider({ children, labels }: UiProviderExtendedProps) {
  const merged = useMemo(() => ({ ...DEFAULT_LABELS, ...labels }), [labels]);
  return (
    // its own storage keys, so the earlier set's theme (light only) never reads this mode, and its
    // own mode even inside the earlier set's provider, where a nested provider would take that one's
    <ThemeProvider theme={theme} defaultMode="system" modeStorageKey="asf-mode" colorSchemeStorageKey="asf-color-scheme" noSsr disableNestedContext>
      <CssBaseline enableColorScheme />
      <LocalizationProvider dateAdapter={AdapterDayjs}>
        <LabelsContext.Provider value={merged}>
          <ToastProvider>{children}</ToastProvider>
        </LabelsContext.Provider>
      </LocalizationProvider>
    </ThemeProvider>
  );
}
