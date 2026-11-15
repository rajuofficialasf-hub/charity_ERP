import type { ColorTone, IconTileProps, ContactListProps, PersonCellProps, CopyButtonProps, ProfileBannerProps, ProfileSectionProps } from '@/ui/contract';

import { Link as RouterLink } from 'react-router';
import { useId, useRef, useState, useEffect } from 'react';

import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import Card from '@mui/material/Card';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import IconButton from '@mui/material/IconButton';

import { Icon } from './icon';
import { Avatar } from './display';
import { fill, useLabels } from './labels';
import { srOnly, appPath, safeHref, safeImageSrc } from './shared';

// ----------------------------------------------------------------------

const TILE_SIZE = new Map<NonNullable<IconTileProps['size']>, number>([
  ['small', 32],
  ['medium', 40],
  ['large', 48],
]);

/** The soft tint and the ink of a tone, as on the asf chips. */
function tint(tone: ColorTone) {
  if (tone === 'neutral') return { bgcolor: 'action.hover', color: 'text.secondary' };
  return { bgcolor: `rgba(var(--asf-palette-${tone}-mainChannel) / 0.16)`, color: `${tone}.dark` };
}

/** A soft square with an icon, an initial or a photo; it stands beside words, so it is hidden from screen readers. */
export function IconTile({ icon, name, src, tone = 'primary', size = 'medium' }: IconTileProps) {
  const px = TILE_SIZE.get(size) ?? 40;
  const image = safeImageSrc(src);
  return (
    <Box
      aria-hidden="true"
      sx={(theme) => ({
        width: px,
        height: px,
        flexShrink: 0,
        borderRadius: 1.25,
        overflow: 'hidden',
        display: 'grid',
        placeItems: 'center',
        fontWeight: 700,
        fontSize: px * 0.42,
        ...tint(tone),
        ...theme.applyStyles('dark', { color: tone === 'neutral' ? 'text.secondary' : `${tone}.light` }),
      })}
    >
      {image ? (
        <Box component="img" src={image} alt="" sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : icon ? (
        <Icon name={icon} size={Math.round(px * 0.55)} />
      ) : (
        (name ?? '').trim().charAt(0).toUpperCase()
      )}
    </Box>
  );
}

/** The first cell of a list of people or records: a tile, the name as a link to its page, a second line. */
export function PersonCell({ name, to, secondary, photo, lang }: PersonCellProps) {
  const path = appPath(to);
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
      <IconTile name={name} src={photo} size="small" />
      <Box sx={{ minWidth: 0 }}>
        {path ? (
          <Link component={RouterLink} to={path} lang={lang} underline="hover" color="inherit" sx={{ typography: 'subtitle2', display: 'block' }}>
            {name}
          </Link>
        ) : (
          <Box component="span" lang={lang} sx={{ typography: 'subtitle2', display: 'block' }}>
            {name}
          </Box>
        )}
        {secondary && (
          <Box component="span" sx={{ typography: 'caption', color: 'text.secondary', display: 'block', fontVariantNumeric: 'tabular-nums' }}>
            {secondary}
          </Box>
        )}
      </Box>
    </Box>
  );
}

/** Copies a value; each press is announced again, success or not. */
export function CopyButton({ value, label }: CopyButtonProps) {
  const labels = useLabels();
  const [result, setResult] = useState<{ press: number; ok: boolean } | null>(null);
  const presses = useRef(0);
  useEffect(() => {
    if (!result) return undefined;
    const timer = setTimeout(() => setResult(null), 2000);
    return () => clearTimeout(timer);
  }, [result]);
  const copy = () => {
    presses.current += 1;
    const press = presses.current;
    const done = (ok: boolean) => setResult({ press, ok });
    if (!navigator.clipboard) return done(false);
    navigator.clipboard.writeText(value).then(
      () => done(true),
      () => done(false)
    );
  };
  return (
    <Box component="span" sx={{ display: 'inline-flex' }}>
      <IconButton size="small" aria-label={fill(labels.copy, { label })} onClick={copy} sx={{ color: 'inherit' }}>
        <Icon name={result?.ok ? 'check' : 'copy'} size={18} />
      </IconButton>
      <Box component="span" role="status" key={result?.press} sx={srOnly}>
        {result ? fill(result.ok ? labels.copied : labels.copyFailed, { label }) : ''}
      </Box>
    </Box>
  );
}

/** A thin line on the banner's dark green. */
const LINE = 'rgba(255 255 255 / 0.1)';

/**
 * The dark banner at the top of a person's profile: the photo, the name with its states and a short
 * line of facts beside the actions, then a darker band of the key facts, each with its label above it
 * and a copy button. Actions that do not fit beside the person move under it; a number is never broken.
 */
export function ProfileBanner({ name, headingLevel = 1, photo, status, facts, actions, dangerAction, actionsLabel }: ProfileBannerProps) {
  const labels = useLabels();
  const band = (facts ?? []).filter((fact) => fact.copy || fact.prominent);
  const line = (facts ?? []).filter((fact) => !fact.copy && !fact.prominent);
  return (
    <Card
      sx={{
        p: 0,
        color: 'common.white',
        background: 'linear-gradient(135deg, var(--asf-palette-primary-darker), var(--asf-palette-primary-dark))',
        overflow: 'hidden',
      }}
    >
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2.5, p: { xs: 2.5, md: 3 } }}>
        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: { xs: 'flex-start', sm: 'center' }, gap: 2, flex: '1 1 320px', minWidth: 0 }}>
          <Avatar name={name} src={photo} size="xlarge" decorative />
          <Box sx={{ minWidth: 0, display: 'grid', gap: 0.75 }}>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
              <Box component={headingLevel === 1 ? 'h1' : 'h2'} sx={{ m: 0, typography: 'h4' }}>
                {name}
              </Box>
              {/* the state chips stand on the dark banner, so they take their dark-mode look */}
              <Box data-color-scheme="dark" sx={{ display: 'contents' }}>
                {status}
              </Box>
            </Box>
            {line.length > 0 && (
              <Box
                component="ul"
                sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 1.5, rowGap: 0.5, m: 0, p: 0, listStyle: 'none', typography: 'body2', color: 'rgba(255 255 255 / 0.8)' }}
              >
                {line.map((fact, index) => (
                  <Box component="li" key={fact.id} sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
                    {index > 0 && <Box component="span" aria-hidden sx={{ width: 4, height: 4, borderRadius: '50%', bgcolor: 'rgba(255 255 255 / 0.4)', mr: 0.75 }} />}
                    {fact.icon && <Icon name={fact.icon} size={16} />}
                    {fact.showLabel ? `${fact.label}: ` : <Box component="span" sx={srOnly}>{`${fact.label}: `}</Box>}
                    <Box component="span" sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                      {fact.display ?? fact.value}
                    </Box>
                  </Box>
                ))}
              </Box>
            )}
          </Box>
        </Box>
        {(actions || dangerAction) && (
          <Box
            role="region"
            aria-label={actionsLabel ?? labels.actions}
            sx={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: { md: 'flex-end' },
              gap: 1,
              flex: '0 1 auto',
              // on the dark green: an outline in white, the main action light, a block in the error colour
              '& .MuiButton-outlined': { borderColor: 'rgba(255 255 255 / 0.32)', color: 'common.white', '&:hover': { borderColor: 'rgba(255 255 255 / 0.56)', bgcolor: 'rgba(255 255 255 / 0.08)' } },
              '& .MuiButton-contained': { bgcolor: 'common.white', color: 'primary.darker', boxShadow: 'none', '&:hover': { bgcolor: 'grey.200', boxShadow: 'none' } },
              '& [data-banner-danger] .MuiButton-root': { bgcolor: 'transparent', color: 'error.light', border: '1px solid rgba(255 255 255 / 0.32)', '&:hover': { bgcolor: 'rgba(255 255 255 / 0.08)', borderColor: 'rgba(255 255 255 / 0.56)' } },
            }}
          >
            {actions}
            {dangerAction && (
              <>
                {/* the line apart stands only in a row beside the person, not among wrapped buttons */}
                {actions && <Box aria-hidden sx={{ display: { xs: 'none', md: 'block' }, width: '1px', alignSelf: 'stretch', minHeight: 28, mx: 0.5, bgcolor: 'rgba(255 255 255 / 0.2)' }} />}
                <Box data-banner-danger="" sx={{ display: 'contents' }}>
                  {dangerAction}
                </Box>
              </>
            )}
          </Box>
        )}
      </Box>
      {band.length > 0 && (
        <Box
          component="ul"
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))',
            m: 0,
            p: 0,
            listStyle: 'none',
            overflow: 'hidden',
            borderTop: `1px solid ${LINE}`,
            bgcolor: 'rgba(0 0 0 / 0.16)',
          }}
        >
          {band.map((fact) => (
            <Box
              component="li"
              key={fact.id}
              // a line before and above each cell; the band's edges clip the outer ones
              sx={{ display: 'grid', gap: 0.5, px: { xs: 2.5, md: 3 }, py: 2, minWidth: 0, boxShadow: `-1px 0 0 ${LINE}, 0 -1px 0 ${LINE}` }}
            >
              <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, typography: 'caption', color: 'rgba(255 255 255 / 0.72)' }}>
                {fact.icon && <Icon name={fact.icon} size={16} />}
                {fact.label}
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, minWidth: 0 }}>
                <Box component="span" sx={{ typography: 'subtitle1', fontWeight: 700, fontVariantNumeric: 'tabular-nums', ...(fact.copy && { whiteSpace: 'nowrap' }), minWidth: 0 }}>
                  {fact.display ?? fact.value}
                </Box>
                {fact.copy && <CopyButton value={fact.value} label={fact.label} />}
              </Box>
            </Box>
          ))}
        </Box>
      )}
    </Card>
  );
}

/** A section of a profile whose title opens and closes it, with an action such as edit beside the title. */
export function ProfileSection({ title, icon, action, defaultOpen = true, headingLevel = 2, children }: ProfileSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const toggleId = useId();
  const bodyId = useId();
  return (
    <Card sx={{ p: 0 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2.5, py: 1.5 }}>
        <Box component={headingLevel === 2 ? 'h2' : 'h3'} sx={{ m: 0, flex: 1, minWidth: 0 }}>
          <ButtonBase
            id={toggleId}
            aria-expanded={open}
            aria-controls={bodyId}
            onClick={() => setOpen((now) => !now)}
            sx={{ width: '100%', justifyContent: 'flex-start', gap: 1.25, py: 0.5, borderRadius: 1, typography: 'h6', textAlign: 'left' }}
          >
            {icon && <IconTile icon={icon} size="small" />}
            <Box component="span" sx={{ flex: 1 }}>
              {title}
            </Box>
            <Box component="span" aria-hidden sx={{ display: 'inline-flex', transform: open ? 'rotate(180deg)' : undefined, transition: 'transform 0.2s' }}>
              <Icon name="chevron-down" size={20} />
            </Box>
          </ButtonBase>
        </Box>
        {action}
      </Box>
      <Box id={bodyId} role="region" aria-labelledby={toggleId} hidden={!open} sx={{ px: 2.5, pb: 2.5 }}>
        {children}
      </Box>
    </Card>
  );
}

/** Ways to reach a person: each with its label, an action link and a copy button. */
export function ContactList({ items }: ContactListProps) {
  // a link the page was given only becomes a link when it calls, mails or opens a web page
  return (
    <Box component="ul" sx={{ m: 0, p: 0, listStyle: 'none', display: 'grid', gap: 1 }}>
      {items.map((item) => (
        // on a narrow screen the buttons move under the value rather than break a number apart
        <Box component="li" key={item.id} sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
          <IconTile icon={item.icon} size="small" tone="neutral" />
          <Box sx={{ flex: '1 1 auto', minWidth: 0 }}>
            <Box component="span" sx={{ display: 'block', typography: 'caption', color: 'text.secondary' }}>
              {item.label}
            </Box>
            <Box component="span" sx={{ display: 'block', typography: 'body2', fontVariantNumeric: 'tabular-nums', overflowWrap: 'break-word' }}>
              {item.value}
            </Box>
          </Box>
          {((safeHref(item.href) && item.actionLabel) || item.copy) && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, ml: 'auto' }}>
              {safeHref(item.href) && item.actionLabel && (
                <Button
                  size="small"
                  variant="outlined"
                  color="inherit"
                  href={safeHref(item.href)}
                  {...(item.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                  endIcon={item.external ? <Icon name="external" size={16} /> : undefined}
                >
                  {item.actionLabel}
                </Button>
              )}
              {item.copy && <CopyButton value={item.value} label={item.label} />}
            </Box>
          )}
        </Box>
      ))}
    </Box>
  );
}
