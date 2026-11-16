import type { FlipCardProps } from '@/ui/contract';

import { Link as RouterLink } from 'react-router';
import { useId, useRef, useState, useEffect } from 'react';

import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import ButtonBase from '@mui/material/ButtonBase';
import type { Theme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';

import { Icon } from './icon';
import { shadows } from '../theme/shadows';
import { fill, useLabels } from './labels';
import { srOnly, appPath } from './shared';

// ----------------------------------------------------------------------

/** A computer's pointer, which may rest on the card; a finger cannot. */
const HOVER = '(hover: hover) and (pointer: fine)';
const TOUCH = '(hover: none)';
const REDUCED = '(prefers-reduced-motion: reduce)';

/** The turn of the approved design: slow enough to be seen as a card turning over. */
const TURN = 'transform 0.7s ease-in-out';

/** A chip over the picture stands on the paper, so its soft tone reads on any part of the picture. */
const onPicture = {
  position: 'absolute',
  display: 'inline-flex',
  borderRadius: 0.75,
  bgcolor: 'background.paper',
} as const;

/** The small outlined button that turns the card; on a computer it shows only when the keyboard reaches it. */
const turnButton = (hiddenUntilFocus: boolean) => ({
  position: 'relative',
  zIndex: 1,
  flexShrink: 0,
  gap: 0.5,
  px: 1.25,
  py: 0.5,
  borderRadius: 1,
  border: 1,
  borderColor: 'divider',
  bgcolor: 'background.paper',
  color: 'text.primary',
  typography: 'caption',
  fontWeight: 600,
  ...(hiddenUntilFocus ? { '&:not(:focus-visible)': srOnly } : {}),
});

/**
 * A card with a front and a back of one size (docs/ui/DESIGN_SYSTEM.md, "Card / Stat"). On a
 * computer it turns over while the pointer rests on it; on a touch screen "Details" turns it and
 * "Back" turns it back, and the keyboard uses the same two buttons on every device (the one on a
 * computer's front shows when the keyboard reaches it). The hidden face is out of the tab order
 * and of the accessibility tree. People who ask for less motion see the faces change without the
 * turn. The title opens `to` from anywhere on the front.
 */
export function FlipCard({
  title,
  to,
  headingLevel = 2,
  media,
  badge,
  mediaCorner,
  mediaFoot,
  front,
  backEyebrow,
  back,
  height = 460,
}: FlipCardProps) {
  const labels = useLabels();
  const titleId = useId();
  const hover = useMediaQuery(HOVER, { noSsr: true });
  const touch = useMediaQuery(TOUCH, { noSsr: true });
  const reduced = useMediaQuery(REDUCED, { noSsr: true });
  const [turned, setTurned] = useState(false);
  const pointerOn = useRef(false);
  const root = useRef<HTMLElement>(null);
  const detailsButton = useRef<HTMLButtonElement>(null);
  const backButton = useRef<HTMLButtonElement>(null);
  // a press of a turn button moves the focus to the other face's button, once that face is shown
  const focusTo = useRef<'front' | 'back' | null>(null);

  useEffect(() => {
    const target = focusTo.current;
    if (!target) return;
    focusTo.current = null;
    (target === 'back' ? backButton : detailsButton).current?.focus();
  }, [turned]);

  const path = appPath(to);
  const heading = `h${headingLevel}` as const;
  // the keyboard is working on the card: a focus the browser shows as a keyboard's, inside it
  const keyboardInside = () => {
    const active = document.activeElement;
    if (!root.current || !active || !root.current.contains(active)) return false;
    try {
      return active.matches(':focus-visible');
    } catch {
      return true;
    }
  };

  // a face is the asf card: radius 16, the card's hairline and soft drop
  const face = (theme: Theme) => ({
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    borderRadius: 2,
    bgcolor: 'background.paper',
    boxShadow: shadows.card(theme.palette.grey[500]),
    backfaceVisibility: 'hidden',
    WebkitBackfaceVisibility: 'hidden',
    ...theme.applyStyles('dark', { boxShadow: shadows.card('#000000') }),
  }) as const;

  return (
    <Box
      component="article"
      ref={root}
      aria-labelledby={titleId}
      data-turned={turned ? 'true' : 'false'}
      onMouseEnter={() => {
        pointerOn.current = true;
        if (hover) setTurned(true);
      }}
      onMouseLeave={() => {
        pointerOn.current = false;
        // the keyboard keeps the card turned while it works on the back
        if (hover && !keyboardInside()) setTurned(false);
      }}
      onBlur={() => {
        // a face that becomes inert drops its focus before the other face takes it: decide once
        // the focus has landed
        window.setTimeout(() => {
          if (root.current?.contains(document.activeElement)) return;
          if (!pointerOn.current) setTurned(false);
        }, 0);
      }}
      sx={{ position: 'relative', height, perspective: '1200px', minWidth: 0 }}
    >
      <Box
        data-flip-inner=""
        sx={{
          position: 'absolute',
          inset: 0,
          transformStyle: 'preserve-3d',
          transition: reduced ? 'none' : TURN,
          transform: turned ? 'rotateY(180deg)' : 'none',
          '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
        }}
      >
        <Box sx={(theme) => face(theme)} inert={turned} aria-hidden={turned ? true : undefined} data-face="front">
          <Box sx={{ position: 'relative', height: 150, flexShrink: 0, overflow: 'hidden', bgcolor: 'action.hover' }}>
            {media}
            {badge && (
              <Box
                component="span"
                sx={(theme) => ({
                  position: 'absolute',
                  left: 16,
                  top: 14,
                  px: 1,
                  py: 0.25,
                  borderRadius: 0.75,
                  bgcolor: 'background.paper',
                  color: 'primary.darker',
                  typography: 'caption',
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  ...theme.applyStyles('dark', { color: 'primary.light' }),
                })}
              >
                {badge}
              </Box>
            )}
            {mediaCorner && <Box sx={{ ...onPicture, right: 16, top: 14 }}>{mediaCorner}</Box>}
            {mediaFoot && <Box sx={{ ...onPicture, left: 16, bottom: 12 }}>{mediaFoot}</Box>}
          </Box>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.75, flex: 1, minHeight: 0, px: 2.5, pt: 2, pb: 1.75 }}>
            <Box
              component={heading}
              id={titleId}
              data-flip-title=""
              sx={{
                m: 0,
                typography: 'h6',
                fontWeight: 700,
                lineHeight: 1.35,
                // a long name breaks anywhere and stops after two lines
                overflowWrap: 'anywhere',
                overflow: 'hidden',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
              }}
            >
              {path ? (
                <Link
                  component={RouterLink}
                  to={path}
                  color="inherit"
                  underline="hover"
                  // the whole front opens it; the turn button stays above
                  sx={{ '&::after': { content: '""', position: 'absolute', inset: 0, zIndex: 0 } }}
                >
                  {title}
                </Link>
              ) : (
                title
              )}
            </Box>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, flex: 1, minHeight: 0 }}>{front}</Box>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 1,
                pt: 1.25,
                borderTop: 1,
                borderColor: 'divider',
                color: 'text.secondary',
                typography: 'caption',
              }}
            >
              {!touch && <span>{labels.flipHint}</span>}
              <ButtonBase
                ref={detailsButton}
                aria-label={fill(labels.flipDetailsOf, { title })}
                onClick={() => {
                  focusTo.current = 'back';
                  setTurned(true);
                }}
                sx={turnButton(!touch)}
              >
                <Icon name="refresh" size={14} />
                <span>{labels.flipDetails}</span>
              </ButtonBase>
            </Box>
          </Box>
        </Box>
        <Box
          sx={(theme) => ({ ...face(theme), transform: 'rotateY(180deg)', p: 2.5, gap: 1.75 })}
          inert={!turned}
          aria-hidden={turned ? undefined : true}
          data-face="back"
        >
          <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}>
            <Box sx={{ minWidth: 0 }}>
              {backEyebrow && (
                <Box sx={{ typography: 'caption', fontWeight: 700, letterSpacing: '0.06em', color: 'primary.dark' }}>{backEyebrow}</Box>
              )}
              <Box
                aria-hidden="true"
                sx={{
                  typography: 'subtitle1',
                  fontWeight: 700,
                  lineHeight: 1.35,
                  overflowWrap: 'anywhere',
                  overflow: 'hidden',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                }}
              >
                {title}
              </Box>
            </Box>
            <ButtonBase
              ref={backButton}
              aria-label={labels.flipBackOf}
              onClick={() => {
                focusTo.current = 'front';
                setTurned(false);
              }}
              sx={turnButton(false)}
            >
              <Icon name="refresh" size={14} />
              <span>{labels.flipBack}</span>
            </ButtonBase>
          </Box>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.75, flex: 1, minHeight: 0 }}>{back}</Box>
        </Box>
      </Box>
    </Box>
  );
}
