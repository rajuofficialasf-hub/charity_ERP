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
    <ThemeProvider theme={theme} defaultMode="system" noSsr>
      <CssBaseline enableColorScheme />
      <LocalizationProvider dateAdapter={AdapterDayjs}>
        <LabelsContext.Provider value={merged}>
          <ToastProvider>{children}</ToastProvider>
        </LabelsContext.Provider>
      </LocalizationProvider>
    </ThemeProvider>
  );
}
