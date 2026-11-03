import type { StatCardProps, ProgressStatProps, SummaryBannerProps } from '@/ui/contract';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CircularProgress from '@mui/material/CircularProgress';

import { Icon } from './icon';
import { Avatar } from './display';
import { toneVars, toneAlpha } from './tone';

// ----------------------------------------------------------------------

/** One figure and its label, with the icon in a tinted corner. */
export function StatCard({ label, value, icon, tone = 'primary', variant = 'plain' }: StatCardProps) {
  return (
    <Card
      sx={(theme) => {
        const t = toneVars(theme, tone);
        return {
          p: 3,
          overflow: 'hidden',
          minHeight: 116,
          ...(variant === 'tinted' && {
            boxShadow: 'none',
            border: `1px solid ${toneAlpha(t.channel, 0.4)}`,
            bgcolor: toneAlpha(t.channel, 0.06),
          }),
        };
      }}
    >
      {icon && (
        <Box
          aria-hidden
          sx={(theme) => {
            const t = toneVars(theme, tone);
            return {
              position: 'absolute',
              top: -28,
              right: -28,
              width: 100,
              height: 100,
              borderRadius: 3,
              transform: 'rotate(45deg)',
              bgcolor: toneAlpha(t.channel, 0.1),
              color: t.main,
              '& > svg': { position: 'absolute', left: 30, bottom: 30, transform: 'rotate(-45deg)' },
            };
          }}
        >
          <Icon name={icon} size={30} />
        </Box>
      )}
      <Box sx={{ typography: 'h3', fontSize: '1.75rem', lineHeight: 1.3, pr: icon ? 7 : 0 }}>{value}</Box>
      <Box sx={{ typography: 'body2', color: 'text.secondary', mt: 1 }}>{label}</Box>
    </Card>
  );
}

/** A figure with a ring showing its share of a whole. */
export function ProgressStat({ label, value, percent, tone = 'primary' }: ProgressStatProps) {
  const clamped = Math.min(100, Math.max(0, Math.round(percent)));
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2.5 }}>
      <Box sx={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
        <CircularProgress variant="determinate" value={100} size={64} thickness={3} sx={{ color: 'divider' }} aria-hidden />
        <CircularProgress
          variant="determinate"
          value={clamped}
          size={64}
          thickness={3}
          aria-label={label}
          sx={(theme) => ({ position: 'absolute', left: 0, color: toneVars(theme, tone).main, '& circle': { strokeLinecap: 'round' } })}
        />
        <Box aria-hidden sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', typography: 'caption', fontWeight: 600 }}>
          {clamped}%
        </Box>
      </Box>
      <Box>
        <Box sx={{ typography: 'h6' }}>{value}</Box>
        <Box sx={{ typography: 'body2', color: 'text.secondary' }}>{label}</Box>
      </Box>
    </Box>
  );
}

/** The welcome band of a dashboard: who is signed in and today's key figures. */
export function SummaryBanner({ title, subtitle, avatar, items }: SummaryBannerProps) {
  return (
    <Box
      component="section"
      aria-label={title}
      sx={(theme) => ({
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 2,
        color: 'common.white',
        // Starts at the dark shade so small white text keeps a 4.5:1 contrast.
        backgroundImage: `linear-gradient(135deg, ${theme.vars.palette.primary.dark}, ${theme.vars.palette.primary.darker})`,
        boxShadow: `0 12px 24px -4px rgba(${theme.vars.palette.primary.mainChannel} / 0.3)`,
        '&::before, &::after': {
          content: '""',
          position: 'absolute',
          borderRadius: '50%',
          bgcolor: 'rgba(255 255 255 / 0.06)',
          pointerEvents: 'none',
        },
        '&::before': { width: 240, height: 240, top: -120, right: -60 },
        '&::after': { width: 180, height: 180, bottom: -110, right: 120 },
      })}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 3 }}>
        {avatar && <Avatar name={avatar.name} src={avatar.src} size="large" decorative />}
        <Box sx={{ minWidth: 0 }}>
          <Box component="h2" sx={{ m: 0, typography: 'h5' }}>
            {title}
          </Box>
          {subtitle && <Box sx={{ typography: 'body2', opacity: 0.8 }}>{subtitle}</Box>}
        </Box>
      </Box>
      <Box
        component="dl"
        sx={{
          m: 0,
          display: 'grid',
          gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: `repeat(${Math.max(items.length, 1)}, auto)` },
          justifyContent: 'start',
          borderTop: '1px solid rgba(255 255 255 / 0.14)',
          bgcolor: 'rgba(0 0 0 / 0.08)',
        }}
      >
        {items.map((item) => (
          <Box
            key={item.label}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              px: 3,
              py: 2,
              borderRight: { md: '1px solid rgba(255 255 255 / 0.14)' },
              '&:last-of-type': { borderRight: 0 },
            }}
          >
            {item.icon ? (
              <Box
                sx={{
                  display: 'grid',
                  placeItems: 'center',
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  border: '1px solid rgba(255 255 255 / 0.32)',
                  flexShrink: 0,
                }}
              >
                <Icon name={item.icon} size={20} />
              </Box>
            ) : (
              item.tone && (
                <Box
                  aria-hidden
                  sx={(theme) => ({ width: 10, height: 10, borderRadius: '50%', flexShrink: 0, bgcolor: toneVars(theme, item.tone).light })}
                />
              )
            )}
            <Box sx={{ minWidth: 0 }}>
              <Box component="dt" sx={{ typography: 'caption', opacity: 0.8, whiteSpace: 'nowrap' }}>
                {item.label}
              </Box>
              <Box component="dd" sx={{ m: 0, typography: 'subtitle2', fontWeight: 700, whiteSpace: 'nowrap' }}>
                {item.value}
              </Box>
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
