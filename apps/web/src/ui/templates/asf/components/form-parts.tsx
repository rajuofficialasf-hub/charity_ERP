import type { FormSectionProps, ErrorSummaryProps } from '@/ui/contract';

import { useRef, useEffect } from 'react';

import Box from '@mui/material/Box';
import MuiAlert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';

import { Icon } from './icon';
import { useLabels } from './labels';

// ----------------------------------------------------------------------

/**
 * The errors of a submitted form at its top, each a link that moves to its field. It takes focus
 * when its errors change, so a screen reader reads them at once.
 */
export function ErrorSummary({ errors, title }: ErrorSummaryProps) {
  const labels = useLabels();
  const ref = useRef<HTMLDivElement>(null);
  const signature = errors.map((error) => `${error.fieldId}:${error.message}`).join('|');
  useEffect(() => {
    if (signature) ref.current?.focus();
  }, [signature]);
  if (errors.length === 0) return null;
  return (
    <MuiAlert ref={ref} severity="error" tabIndex={-1} icon={<Icon name="error" size={22} />} sx={{ outline: 'none', '&:focus-visible': { outline: '2px solid', outlineOffset: 2 } }}>
      <AlertTitle>{title ?? labels.errorSummaryTitle}</AlertTitle>
      <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
        {errors.map((error) => (
          <li key={error.fieldId}>
            <Box
              component="a"
              href={`#${error.fieldId}`}
              sx={{ color: 'inherit', fontWeight: 600 }}
              onClick={(event) => {
                const target = document.getElementById(error.fieldId);
                if (!target) return;
                event.preventDefault();
                target.focus();
                target.scrollIntoView?.({ block: 'center' });
              }}
            >
              {error.message}
            </Box>
          </li>
        ))}
      </Box>
    </MuiAlert>
  );
}

/** A part of a long form: a fieldset named by its title, the fields under it. */
export function FormSection({ title, description, children }: FormSectionProps) {
  return (
    <Box component="fieldset" sx={{ m: 0, p: 0, border: 0, minWidth: 0, display: 'grid', gap: 2 }}>
      <Box component="legend" sx={{ p: 0, mb: description ? 0 : 1, typography: 'subtitle1', fontWeight: 700 }}>
        {title}
      </Box>
      {description && (
        <Box component="p" sx={{ m: 0, mt: -1, typography: 'body2', color: 'text.secondary' }}>
          {description}
        </Box>
      )}
      {children}
    </Box>
  );
}
