import { useColorScheme } from '@mui/material/styles';
import IconButton from '@mui/material/IconButton';

import { Icon } from '../icon';
import { useLabels } from '../labels';

// ----------------------------------------------------------------------

/** Switches between light and dark. Until the user picks one, the system's choice applies. */
export function ColorModeButton() {
  const labels = useLabels();
  const { mode, systemMode, setMode } = useColorScheme();
  const current = mode === 'system' ? systemMode : mode;
  const isDark = current === 'dark';
  return (
    <IconButton aria-label={isDark ? labels.lightMode : labels.darkMode} onClick={() => setMode(isDark ? 'light' : 'dark')} sx={{ color: 'text.secondary' }}>
      <Icon name={isDark ? 'sun' : 'moon'} size={22} />
    </IconButton>
  );
}
