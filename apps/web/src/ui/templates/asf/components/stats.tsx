import type { StatCardProps, ProgressStatProps, SummaryBannerProps } from '@/ui/contract';

import { Link as RouterLink } from 'react-router';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import CircularProgress from '@mui/material/CircularProgress';

import { Icon } from './icon';
import { Avatar } from './display';
import { toneVars, toneAlpha } from './tone';
import { appPath } from './shared';

// ----------------------------------------------------------------------

/** One figure and its label, with the icon in a tinted corner; with `to` the whole card is a link. */
export function StatCard({ label, value, icon, tone = 'primary', variant = 'plain', to }: StatCardProps) {
  const path = appPath(to);
  const box = { p: 3, minHeight: 116 };
  const body = (
    <>
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
    </>
  );
  return (
    <Card
      sx={(theme) => {
        const t = toneVars(theme, tone);
        return {
          ...(!path && box),
          position: 'relative',
          overflow: 'hidden',
          ...(variant === 'tinted' && {
            boxShadow: 'none',
            border: `1px solid ${toneAlpha(t.channel, 0.4)}`,
            bgcolor: toneAlpha(t.channel, 0.06),
          }),
        };
      }}
    >
      {path ? (
        <CardActionArea component={RouterLink} to={path} sx={{ ...box, display: 'block', height: '100%' }}>
          {body}
        </CardActionArea>
      ) : (
        body
      )}
    </Card>
  );
}

// ----------------------------------------------------------------------

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
        {items.map((item) => {
          // a list of terms holds only its terms and values: the mark sits inside the term, placed
          // beside both lines from the item's padding
          const mark = item.icon ? 36 : item.tone ? 10 : 0;
          return (
            <Box
              key={item.label}
              sx={{
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                minWidth: 0,
                py: 2,
                pr: { xs: 2, md: 3 },
                pl: mark ? { xs: `calc(16px + ${mark}px + 8px)`, md: `calc(24px + ${mark}px + 12px)` } : { xs: 2, md: 3 },
                minHeight: 68,
                borderRight: { md: '1px solid rgba(255 255 255 / 0.14)' },
                '&:last-of-type': { borderRight: 0 },
              }}
            >
              {/* a name wraps in a phone's half-width column instead of being cut */}
              <Box component="dt" sx={{ typography: 'caption', opacity: 0.8, whiteSpace: { xs: 'normal', md: 'nowrap' } }}>
                {item.icon ? (
                  <Box
                    component="span"
                    sx={{
                      position: 'absolute',
                      left: { xs: 16, md: 24 },
                      top: '50%',
                      transform: 'translateY(-50%)',
                      display: 'grid',
                      placeItems: 'center',
                      width: 36,
                      height: 36,
                      borderRadius: '50%',
                      border: '1px solid rgba(255 255 255 / 0.32)',
                    }}
                  >
                    <Icon name={item.icon} size={20} />
                  </Box>
                ) : (
                  item.tone && (
                    <Box
                      component="span"
                      aria-hidden
                      sx={(theme) => ({
                        position: 'absolute',
                        left: { xs: 16, md: 24 },
                        top: '50%',
                        transform: 'translateY(-50%)',
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        bgcolor: toneVars(theme, item.tone).light,
                      })}
                    />
                  )
                )}
                {item.label}
              </Box>
              <Box component="dd" sx={{ m: 0, typography: 'subtitle2', fontWeight: 700, whiteSpace: 'nowrap' }}>
                {item.value}
              </Box>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
