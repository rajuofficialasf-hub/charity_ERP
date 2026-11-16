import type { LinkTileProps, FeatureListProps, CalloutBandProps, LanguageSwitchProps } from '@/ui/contract';

import { Link } from 'react-router';

import Box from '@mui/material/Box';

import { Icon } from '../icon';
import { toneVars } from '../tone';
import { SegmentedControl } from '../segmented-control';

// ----------------------------------------------------------------------

/** Short points side by side with thin dividers; stacked on phones. */
export function FeatureList({ items }: FeatureListProps) {
  return (
    <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gridTemplateColumns: { xs: '1fr', md: `repeat(${items.length}, minmax(0, 1fr))` } }}>
      {items.map((item) => (
        <Box
          component="li"
          key={item.title}
          sx={{
            textAlign: 'center',
            px: { xs: 2, md: 4 },
            py: { xs: 3, md: 1 },
            borderTop: { xs: '1px solid', md: 'none' },
            borderLeft: { md: '1px solid' },
            borderColor: { xs: 'divider', md: 'divider' },
            '&:first-of-type': { borderTop: 'none', borderLeft: 'none' },
          }}
        >
          <Box sx={{ color: 'warning.main', mb: 1.5 }}>
            <Icon name={item.icon} size={44} />
          </Box>
          <Box component="h3" sx={{ m: 0, typography: 'h5', fontWeight: 800 }}>
            {item.title}
          </Box>
          <Box component="p" sx={{ m: 0, mt: 1, typography: 'body2', color: 'text.secondary', maxWidth: '36ch', mx: 'auto' }}>
            {item.description}
          </Box>
        </Box>
      ))}
    </Box>
  );
}

/** A large coloured link for one of a few top-level choices. Text uses the tone's own contrast colour. */
export function LinkTile({ to, label, icon, tone = 'primary' }: LinkTileProps) {
  return (
    <Box
      component={Link}
      to={to}
      sx={(t) => {
        const c = toneVars(t, tone);
        return {
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 1.5,
          minHeight: 148,
          p: 3,
          borderRadius: 2,
          textAlign: 'center',
          textDecoration: 'none',
          bgcolor: tone === 'neutral' ? c.darker : c.main,
          color: tone === 'neutral' ? t.vars.palette.common.white : t.vars.palette[tone].contrastText,
          typography: 'h6',
          fontWeight: 700,
          transition: 'transform 200ms cubic-bezier(0.16, 1, 0.3, 1), box-shadow 200ms',
          '&:hover': { transform: 'translateY(-3px)', boxShadow: `0 16px 32px -12px rgba(${c.channel} / 0.6)` },
        };
      }}
    >
      <Icon name={icon} size={48} />
      {label}
    </Box>
  );
}

/** A coloured band that asks for one thing, such as a newsletter sign-up. */
export function CalloutBand({ title, description, children }: CalloutBandProps) {
  return (
    <Box
      component="section"
      aria-label={title}
      sx={(t) => ({
        position: 'relative',
        overflow: 'hidden',
        isolation: 'isolate',
        borderRadius: 2,
        px: { xs: 3, md: 8 },
        py: { xs: 6, md: 8 },
        textAlign: 'center',
        color: 'common.white',
        bgcolor: t.vars.palette.primary.dark,
        '&::before, &::after': { content: '""', position: 'absolute', zIndex: -1, borderRadius: '50%', border: '40px solid rgba(255 255 255 / 0.06)' },
        '&::before': { width: 260, height: 260, top: -150, left: '8%' },
        '&::after': { width: 220, height: 220, bottom: -140, right: '6%' },
      })}
    >
      <Box component="h2" sx={{ m: 0, typography: 'h3', fontSize: { xs: '1.375rem', md: '1.75rem' }, textWrap: 'balance' }}>
        {title}
      </Box>
      {description && (
        <Box component="p" sx={{ m: 0, mt: 1.5, color: 'rgba(255 255 255 / 0.85)' }}>
          {description}
        </Box>
      )}
      {children && <Box sx={{ mt: 4, maxWidth: 480, mx: 'auto' }}>{children}</Box>}
    </Box>
  );
}

/** The language switch of a public page: the segmented control with the languages as its options. */
export function LanguageSwitch(props: LanguageSwitchProps) {
  return <SegmentedControl {...props} />;
}
