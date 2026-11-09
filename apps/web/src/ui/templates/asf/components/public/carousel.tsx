import type { CarouselProps } from '@/ui/contract';

import { useRef, Children, useState, useEffect, useCallback } from 'react';

import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';

import { Icon } from '../icon';
import { useLabels } from '../labels';

// ----------------------------------------------------------------------

/** A row that scrolls sideways with snap points; the buttons move it one view at a time. */
export function Carousel({ label, children, itemsPerView = { base: 1, sm: 2, md: 3 } }: CarouselProps) {
  const labels = useLabels();
  const track = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: false });

  const update = useCallback(() => {
    const el = track.current;
    if (!el) return;
    setEdges({ start: el.scrollLeft <= 2, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 2 });
  }, []);

  useEffect(() => {
    update();
    const el = track.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [update]);

  const move = (direction: 1 | -1) => track.current?.scrollBy({ left: direction * track.current.clientWidth, behavior: 'smooth' });
  const basis = (n?: number) => (n ? `calc((100% - ${(n - 1) * 24}px) / ${n})` : undefined);
  const button = { position: 'absolute', top: '40%', zIndex: 1, bgcolor: 'background.paper', boxShadow: '0 4px 12px -2px rgba(0 0 0 / 0.16)', '&:hover': { bgcolor: 'background.paper' }, '&.Mui-disabled': { opacity: 0 } } as const;

  return (
    <Box role="region" aria-roledescription="carousel" aria-label={label} sx={{ position: 'relative' }}>
      <IconButton aria-label={labels.previous} disabled={edges.start} onClick={() => move(-1)} sx={{ ...button, left: { xs: 4, lg: -22 } }}>
        <Icon name="chevron-left" size={20} />
      </IconButton>
      <Box
        ref={track}
        onScroll={update}
        component="ul"
        sx={{
          listStyle: 'none',
          m: 0,
          p: 0,
          pb: 1,
          display: 'flex',
          gap: 3,
          overflowX: 'auto',
          scrollSnapType: 'x mandatory',
          scrollbarWidth: 'none',
          '&::-webkit-scrollbar': { display: 'none' },
          '& > li': {
            flex: '0 0 auto',
            scrollSnapAlign: 'start',
            width: { xs: basis(itemsPerView.base ?? 1), sm: basis(itemsPerView.sm), md: basis(itemsPerView.md), lg: basis(itemsPerView.lg) },
          },
        }}
      >
        {Children.toArray(children).map((child, index) => (
          <li key={index} aria-roledescription="slide">
            {child}
          </li>
        ))}
      </Box>
      <IconButton aria-label={labels.next} disabled={edges.end} onClick={() => move(1)} sx={{ ...button, right: { xs: 4, lg: -22 } }}>
        <Icon name="chevron-right" size={20} />
      </IconButton>
    </Box>
  );
}
