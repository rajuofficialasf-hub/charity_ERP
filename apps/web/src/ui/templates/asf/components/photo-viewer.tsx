import type { PhotoViewerProps } from '@/ui/contract';
import type { KeyboardEvent, PointerEvent, WheelEvent } from 'react';

import { useRef, useState, useEffect, useCallback } from 'react';

import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import MuiDialog from '@mui/material/Dialog';
import ButtonBase from '@mui/material/ButtonBase';
import IconButton from '@mui/material/IconButton';
import useMediaQuery from '@mui/material/useMediaQuery';
import CircularProgress from '@mui/material/CircularProgress';

import { Icon } from './icon';
import { fill, useCount, useLabels } from './labels';

// ----------------------------------------------------------------------

/** From this width the details stand beside the photo; below it they open as a sheet. */
const WIDE = '(min-width: 1024px)';
const MIN_SCALE = 1;
const MAX_SCALE = 5;
const STEP = 0.5;
const WHOLE = { scale: 1, x: 0, y: 0 };

const clampScale = (scale: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));

/** The keys of the viewer; a key typed into a field of the details stays the field's. */
const typing = (target: EventTarget) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

/**
 * The photos of a record seen large (`PhotoViewerProps` in the contract): a dark stage that fills
 * the screen, the photo zoomed and moved by pointer, wheel, two fingers and keys, the strip of the
 * record's photos, and the details beside the photo or in a sheet. Nothing here deletes a photo.
 */
export function PhotoViewer({
  open,
  onClose,
  photos,
  index,
  onIndexChange,
  title,
  details,
  actions,
}: PhotoViewerProps) {
  const labels = useLabels();
  const count = useCount();
  const wide = useMediaQuery(WIDE, { noSsr: true });
  const [zoomed, setZoomed] = useState({ photo: -1, ...WHOLE });
  const [dragging, setDragging] = useState(false);
  const [paneOpen, setPaneOpen] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [full, setFull] = useState(false);
  const frame = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; scale: number } | null>(null);
  const total = photos.length;
  const photo = photos[index];
  const canFullScreen = typeof HTMLElement.prototype.requestFullscreen === 'function';

  /** How far a zoomed photo may move before its edge leaves the stage's edge. */
  const bound = (scale: number) => {
    const box = stage.current?.getBoundingClientRect();
    return {
      x: box ? ((scale - 1) * box.width) / 2 : 0,
      y: box ? ((scale - 1) * box.height) / 2 : 0,
    };
  };
  const within = (value: number, limit: number) => Math.max(-limit, Math.min(limit, value));

  // the zoom belongs to the photo it was made on, so another photo starts whole
  const zoom = zoomed.photo === index ? zoomed : { photo: index, ...WHOLE };
  const setZoom = (next: typeof WHOLE | ((z: typeof WHOLE) => typeof WHOLE)) =>
    setZoomed((current) => {
      const base = current.photo === index ? current : { photo: index, ...WHOLE };
      return { photo: index, ...(typeof next === 'function' ? next(base) : next) };
    });

  useEffect(() => {
    const changed = () => setFull(document.fullscreenElement !== null);
    document.addEventListener('fullscreenchange', changed);
    return () => {
      document.removeEventListener('fullscreenchange', changed);
      // a viewer that closes leaves the full screen it asked for
      if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => {});
    };
  }, []);

  const go = useCallback(
    (next: number) => {
      if (next >= 0 && next < total && next !== index) onIndexChange(next);
    },
    [index, onIndexChange, total],
  );

  const zoomTo = (scale: number) =>
    setZoom((z) => {
      const next = clampScale(scale);
      // back at the whole photo it sits in the middle again; a smaller zoom keeps the photo
      // within the stage's edges
      if (next === MIN_SCALE) return WHOLE;
      const limit = bound(next);
      return { scale: next, x: within(z.x, limit.x), y: within(z.y, limit.y) };
    });

  const toggleFull = () => {
    if (full) void document.exitFullscreen?.().catch(() => {});
    // the whole page goes full screen, so the details sheet and a message drawn over it stay in
    // view; a browser that refuses keeps the viewer at the window's size, which it already fills
    else void document.documentElement.requestFullscreen?.().catch(() => {});
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (typing(event.target)) return;
    const keys: Record<string, () => void> = {
      ArrowLeft: () => go(index - 1),
      ArrowRight: () => go(index + 1),
      '+': () => zoomTo(zoom.scale + STEP),
      '=': () => zoomTo(zoom.scale + STEP),
      '-': () => zoomTo(zoom.scale - STEP),
      '0': () => setZoom(WHOLE),
    };
    const action = Object.hasOwn(keys, event.key) ? keys[event.key] : undefined;
    if (!action) return;
    event.preventDefault();
    action();
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    // a press on the stage's own buttons stays theirs, so their click arrives
    if (event.target instanceof Element && event.target.closest('button')) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    setDragging(true);
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { distance: Math.hypot(a!.x - b!.x, a!.y - b!.y), scale: zoom.scale };
    }
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const last = pointers.current.get(event.pointerId);
    if (!last) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const distance = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      if (pinch.current.distance > 0)
        zoomTo((pinch.current.scale * distance) / pinch.current.distance);
      return;
    }
    if (zoom.scale === MIN_SCALE) return;
    const limit = bound(zoom.scale);
    setZoom((z) => ({
      ...z,
      x: within(z.x + event.clientX - last.x, limit.x),
      y: within(z.y + event.clientY - last.y, limit.y),
    }));
  };

  const onPointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (!pointers.current.size) setDragging(false);
  };

  const onWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (!event.deltaY) return;
    zoomTo(zoom.scale + (event.deltaY < 0 ? STEP / 2 : -STEP / 2));
  };

  const detailsButton = details ? (
    <IconButton
      color="inherit"
      aria-label={labels.photoDetails}
      aria-expanded={wide ? paneOpen : sheetOpen}
      onClick={() => (wide ? setPaneOpen((shown) => !shown) : setSheetOpen(true))}
    >
      <Icon name="info" size={22} />
    </IconButton>
  ) : null;

  const control = { color: 'inherit', '&.Mui-disabled': { color: 'grey.600' } } as const;

  return (
    <MuiDialog
      open={open}
      onClose={onClose}
      fullScreen
      onKeyDown={onKeyDown}
      slotProps={{
        paper: {
          'aria-label': labels.photoViewer,
          sx: { bgcolor: 'grey.900', color: 'common.white' },
        },
      }}
    >
      <Box
        ref={frame}
        sx={{ display: 'flex', flexDirection: 'column', height: '100%', bgcolor: 'grey.900' }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            px: { xs: 1, sm: 2 },
            py: 1,
            borderBottom: 1,
            borderColor: 'grey.800',
          }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            {title && (
              <Box
                component="h2"
                sx={{
                  m: 0,
                  typography: 'subtitle1',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {title}
              </Box>
            )}
            {total > 0 && (
              <Box sx={{ typography: 'caption', color: 'grey.400' }}>
                {fill(labels.photoPosition, {
                  index: count.format(index + 1),
                  count: count.format(total),
                })}
              </Box>
            )}
          </Box>
          {actions && (
            // the page's buttons take the bar's light colour on its dark ground
            <Box
              sx={{
                display: 'flex',
                gap: 0.5,
                alignItems: 'center',
                '& .MuiIconButton-root': { color: 'inherit' },
              }}
            >
              {actions}
            </Box>
          )}
          {detailsButton}
          <IconButton color="inherit" aria-label={labels.close} onClick={onClose}>
            <Icon name="close" size={22} />
          </IconButton>
        </Box>

        <Box sx={{ display: 'flex', flex: 1, minHeight: 0 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
            <Box
              ref={stage}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerEnd}
              onPointerCancel={onPointerEnd}
              onWheel={onWheel}
              onDoubleClick={() => (zoom.scale === MIN_SCALE ? zoomTo(2) : setZoom(WHOLE))}
              sx={{
                position: 'relative',
                flex: 1,
                minHeight: 0,
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                touchAction: 'none',
                userSelect: 'none',
                cursor: zoom.scale > MIN_SCALE ? 'grab' : 'zoom-in',
              }}
            >
              {photo?.src ? (
                <Box
                  component="img"
                  src={photo.src}
                  alt={photo.alt}
                  draggable={false}
                  style={{ transform: `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.scale})` }}
                  sx={{
                    maxWidth: '100%',
                    maxHeight: '100%',
                    objectFit: 'contain',
                    transition: dragging ? 'none' : 'transform 0.15s ease-out',
                    '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
                  }}
                />
              ) : photo?.message ? (
                <Box
                  role="status"
                  sx={{ typography: 'body2', color: 'grey.300', px: 3, textAlign: 'center' }}
                >
                  {photo.message}
                </Box>
              ) : (
                <CircularProgress color="inherit" aria-label={labels.loading} />
              )}
              {total > 1 && (
                <>
                  <IconButton
                    aria-label={labels.previousPhoto}
                    disabled={index === 0}
                    onClick={() => go(index - 1)}
                    sx={{
                      ...control,
                      position: 'absolute',
                      left: 8,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      bgcolor: 'grey.800',
                    }}
                  >
                    <Icon name="chevron-left" size={24} />
                  </IconButton>
                  <IconButton
                    aria-label={labels.nextPhoto}
                    disabled={index === total - 1}
                    onClick={() => go(index + 1)}
                    sx={{
                      ...control,
                      position: 'absolute',
                      right: 8,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      bgcolor: 'grey.800',
                    }}
                  >
                    <Icon name="chevron-right" size={24} />
                  </IconButton>
                </>
              )}
            </Box>

            <Box sx={{ display: 'flex', justifyContent: 'center', gap: 0.5, py: 0.5 }}>
              <IconButton
                sx={control}
                aria-label={labels.zoomOut}
                disabled={zoom.scale <= MIN_SCALE}
                onClick={() => zoomTo(zoom.scale - STEP)}
              >
                <Icon name="zoom-out" size={22} />
              </IconButton>
              <IconButton
                sx={control}
                aria-label={labels.zoomReset}
                disabled={zoom.scale === MIN_SCALE}
                onClick={() => setZoom(WHOLE)}
              >
                <Icon name="collapse" size={22} />
              </IconButton>
              <IconButton
                sx={control}
                aria-label={labels.zoomIn}
                disabled={zoom.scale >= MAX_SCALE}
                onClick={() => zoomTo(zoom.scale + STEP)}
              >
                <Icon name="zoom-in" size={22} />
              </IconButton>
              {canFullScreen && (
                <IconButton
                  sx={control}
                  aria-label={full ? labels.leaveFullScreen : labels.fullScreen}
                  onClick={toggleFull}
                >
                  <Icon name="maximize" size={22} />
                </IconButton>
              )}
            </Box>

            {total > 1 && (
              <Box
                component="ul"
                aria-label={labels.photoStrip}
                sx={{
                  display: 'flex',
                  gap: 1,
                  m: 0,
                  px: 2,
                  pb: 1.5,
                  pt: 0.5,
                  listStyle: 'none',
                  overflowX: 'auto',
                  justifyContent: { md: 'center' },
                }}
              >
                {photos.map((item, i) => (
                  <Box component="li" key={item.id} sx={{ flex: 'none' }}>
                    <ButtonBase
                      aria-label={item.alt}
                      aria-current={i === index ? 'true' : undefined}
                      onClick={() => go(i)}
                      sx={{
                        width: 56,
                        height: 56,
                        borderRadius: 1,
                        overflow: 'hidden',
                        border: 2,
                        borderColor: i === index ? 'primary.main' : 'transparent',
                        bgcolor: 'grey.800',
                        opacity: i === index ? 1 : 0.7,
                        '&:focus-visible': {
                          outline: 2,
                          outlineColor: 'primary.light',
                          outlineStyle: 'solid',
                        },
                      }}
                    >
                      {(item.thumbSrc ?? item.src) && (
                        <Box
                          component="img"
                          src={item.thumbSrc ?? item.src}
                          alt=""
                          sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      )}
                    </ButtonBase>
                  </Box>
                ))}
              </Box>
            )}
          </Box>

          {details && wide && paneOpen && (
            <Box
              component="aside"
              aria-label={labels.photoDetails}
              sx={{
                width: 340,
                flex: 'none',
                overflowY: 'auto',
                p: 2.5,
                bgcolor: 'background.paper',
                color: 'text.primary',
              }}
            >
              <Box component="h2" sx={{ mt: 0, mb: 2, typography: 'h6' }}>
                {labels.photoDetails}
              </Box>
              {details}
            </Box>
          )}
        </Box>
      </Box>

      {details && !wide && (
        <Drawer
          anchor="bottom"
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          slotProps={{
            paper: {
              role: 'dialog',
              'aria-label': labels.photoDetails,
              sx: { maxHeight: '80vh', borderTopLeftRadius: 16, borderTopRightRadius: 16 },
            },
          }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              px: 2.5,
              py: 1.5,
              borderBottom: 1,
              borderColor: 'divider',
            }}
          >
            <Box component="h2" sx={{ m: 0, flex: 1, typography: 'h6' }}>
              {labels.photoDetails}
            </Box>
            <IconButton aria-label={labels.close} onClick={() => setSheetOpen(false)}>
              <Icon name="close" size={20} />
            </IconButton>
          </Box>
          <Box sx={{ overflowY: 'auto', p: 2.5 }}>{details}</Box>
        </Drawer>
      )}
    </MuiDialog>
  );
}
