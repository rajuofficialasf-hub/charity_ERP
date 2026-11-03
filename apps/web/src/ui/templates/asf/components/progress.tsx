import type { SkeletonProps, StepperProps, TimelineProps, TimelineStatus, ProgressBarProps } from '@/ui/contract';

import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import MuiSkeleton from '@mui/material/Skeleton';

import { Icon } from './icon';
import { fill, useLabels } from './labels';

// ----------------------------------------------------------------------

/** Read by screen readers, not shown. */
const srOnly = {
  position: 'absolute',
  width: 1,
  height: 1,
  p: 0,
  m: '-1px',
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
} as const;

const count = new Intl.NumberFormat('en-US');

type StepState = 'done' | 'current' | 'missing' | 'upcoming';

/** The steps of a task in order; with `onSelect` each step is a button that opens it. */
export function Stepper({ label, steps, current, marks, onSelect }: StepperProps) {
  const labels = useLabels();
  return (
    <Box component="ol" aria-label={label} sx={{ display: 'flex', flexWrap: 'wrap', gap: { xs: 1, sm: 2 }, m: 0, p: 0, listStyle: 'none' }}>
      {steps.map((name, index) => {
        const mark = marks?.at(index);
        const state: StepState =
          index === current ? 'current' : mark === 'missing' ? 'missing' : mark === 'complete' || (!marks && index < current) ? 'done' : 'upcoming';
        const finished = state === 'done' || (state === 'current' && mark === 'complete');
        const content = (
          <>
            <Box
              component="span"
              aria-hidden
              sx={(theme) => ({
                width: 28,
                height: 28,
                flexShrink: 0,
                borderRadius: '50%',
                display: 'grid',
                placeItems: 'center',
                typography: 'caption',
                fontWeight: 700,
                fontVariantNumeric: 'tabular-nums',
                ...(state === 'current'
                  ? { bgcolor: 'primary.main', color: 'primary.contrastText' }
                  : finished
                    ? { bgcolor: 'rgba(var(--asf-palette-primary-mainChannel) / 0.16)', color: 'primary.dark', ...theme.applyStyles('dark', { color: 'primary.light' }) }
                    : state === 'missing'
                      ? { bgcolor: 'rgba(var(--asf-palette-warning-mainChannel) / 0.16)', color: 'warning.dark', ...theme.applyStyles('dark', { color: 'warning.light' }) }
                      : { bgcolor: 'action.hover', color: 'text.secondary' }),
              })}
            >
              {mark === 'missing' ? <Icon name="warning" size={16} /> : finished ? <Icon name="check" size={16} /> : index + 1}
            </Box>
            <Box component="span" sx={{ typography: 'body2', fontWeight: state === 'current' ? 700 : 500, color: state === 'upcoming' ? 'text.secondary' : 'text.primary' }}>
              {name}
            </Box>
            {mark === 'missing' && (
              <Box component="span" sx={srOnly}>
                {`, ${labels.stepMissing}`}
              </Box>
            )}
          </>
        );
        const row = { display: 'flex', alignItems: 'center', gap: 1 } as const;
        return (
          <Box component="li" key={name} data-state={state} aria-current={state === 'current' ? 'step' : undefined} sx={row}>
            {onSelect ? (
              <ButtonBase onClick={() => onSelect(index)} sx={{ ...row, borderRadius: 1, px: 0.5, py: 0.25, textAlign: 'left' }}>
                {content}
              </ButtonBase>
            ) : (
              content
            )}
          </Box>
        );
      })}
    </Box>
  );
}

const STATUS_WORD = new Map<TimelineStatus, 'stepDone' | 'stepCurrent' | 'stepUpcoming' | 'stepSkipped' | 'stepRejected'>([
  ['done', 'stepDone'],
  ['current', 'stepCurrent'],
  ['upcoming', 'stepUpcoming'],
  ['skipped', 'stepSkipped'],
  ['rejected', 'stepRejected'],
]);

const STATUS_DOT = new Map<TimelineStatus, { color: string; icon?: 'check' | 'close' }>([
  ['done', { color: 'primary.main', icon: 'check' }],
  ['current', { color: 'info.main' }],
  ['upcoming', { color: 'grey.400' }],
  ['skipped', { color: 'grey.500' }],
  ['rejected', { color: 'error.main', icon: 'close' }],
]);

/** What happened to a record, in order; each step's state is read with its title. */
export function Timeline({ label, steps, orientation = 'vertical', showActor }: TimelineProps) {
  const labels = useLabels();
  const word = (status: TimelineStatus) => labels[STATUS_WORD.get(status) ?? 'stepUpcoming'];
  if (orientation === 'horizontal') {
    return (
      <Box component="ol" aria-label={label} sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, m: 0, p: 0, listStyle: 'none' }}>
        {steps.map((step) => (
          <Box
            component="li"
            key={step.id}
            aria-current={step.status === 'current' ? 'step' : undefined}
            sx={{
              px: 1.5,
              py: 0.5,
              borderRadius: 1,
              typography: 'caption',
              fontWeight: step.status === 'current' ? 700 : 500,
              bgcolor: step.status === 'current' ? 'rgba(var(--asf-palette-primary-mainChannel) / 0.16)' : 'action.hover',
              color: step.status === 'upcoming' ? 'text.secondary' : 'text.primary',
              textDecoration: step.status === 'skipped' ? 'line-through' : undefined,
            }}
          >
            {step.title}
            <Box component="span" sx={srOnly}>{`, ${word(step.status)}`}</Box>
          </Box>
        ))}
      </Box>
    );
  }
  return (
    <Box component="ol" aria-label={label} sx={{ m: 0, p: 0, listStyle: 'none' }}>
      {steps.map((step, index) => {
        const dot = STATUS_DOT.get(step.status) ?? { color: 'grey.400' };
        const last = index === steps.length - 1;
        return (
          <Box component="li" key={step.id} aria-current={step.status === 'current' ? 'step' : undefined} sx={{ display: 'flex', gap: 1.5 }}>
            <Box aria-hidden sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <Box sx={{ width: 20, height: 20, mt: 0.25, borderRadius: '50%', display: 'grid', placeItems: 'center', bgcolor: dot.color, color: 'common.white' }}>
                {dot.icon && <Icon name={dot.icon} size={14} />}
              </Box>
              {!last && <Box sx={{ flex: 1, width: 2, my: 0.5, bgcolor: 'divider', minHeight: 16 }} />}
            </Box>
            <Box sx={{ pb: last ? 0 : 2, minWidth: 0 }}>
              <Box component="p" sx={{ m: 0, typography: 'subtitle2', color: step.status === 'upcoming' ? 'text.secondary' : 'text.primary' }}>
                {step.title}
                <Box component="span" sx={srOnly}>{`, ${word(step.status)}`}</Box>
              </Box>
              {(step.time || (showActor && step.actor)) && (
                <Box component="p" sx={{ m: 0, typography: 'caption', color: 'text.secondary' }}>
                  {showActor && step.actor}
                  {showActor && step.actor && step.time && ' · '}
                  {step.time && <Box component="span" sx={{ fontVariantNumeric: 'tabular-nums' }}>{step.time}</Box>}
                </Box>
              )}
              {step.comment && <Box sx={{ mt: 0.75, p: 1.25, borderRadius: 1, bgcolor: 'action.hover', typography: 'body2' }}>{step.comment}</Box>}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}

const SEGMENT_COLOURS = ['primary.main', 'info.main', 'warning.main', 'secondary.main'] as const;

/** How far a figure is towards its target, with the numbers written beside the bar. */
export function ProgressBar({ label, value, max, showValue = true, tone = 'primary', size = 'medium', segments }: ProgressBarProps) {
  const labels = useLabels();
  const top = max > 0 ? max : 1;
  // the bar stays between empty and full; the words keep the true figure
  const now = Math.min(Math.max(value, 0), top);
  const percent = Math.round((Math.max(value, 0) / top) * 100);
  const text = fill(labels.progressText, { value: count.format(value), max: count.format(max), percent });
  const parts = segments?.slice(0, 4) ?? [{ label, value }];
  const scale = Math.max(top, value);
  return (
    <Box sx={{ display: 'grid', gap: 0.75 }}>
      <Box role="progressbar" aria-label={label} aria-valuenow={now} aria-valuemin={0} aria-valuemax={top} aria-valuetext={text} sx={{ display: 'grid', gap: 0.75 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, typography: 'body2' }}>
          <span>{label}</span>
          {showValue && (
            <Box component="span" sx={{ color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
              {text}
            </Box>
          )}
        </Box>
        <Box sx={{ display: 'flex', height: size === 'small' ? 6 : 10, borderRadius: 5, overflow: 'hidden', bgcolor: 'action.hover' }}>
          {parts.map((part, index) => (
            <Box
              key={part.label}
              sx={{
                width: `${(Math.max(part.value, 0) / scale) * 100}%`,
                bgcolor: segments ? SEGMENT_COLOURS.at(index) : `${tone}.main`,
                '& + &': { borderLeft: '2px solid', borderColor: 'background.paper' },
              }}
            />
          ))}
        </Box>
      </Box>
      {segments && (
        <Box component="ul" sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, m: 0, p: 0, listStyle: 'none', typography: 'caption', color: 'text.secondary' }}>
          {parts.map((part, index) => (
            <Box component="li" key={part.label} sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
              <Box component="i" aria-hidden sx={{ width: 10, height: 10, borderRadius: 0.5, bgcolor: SEGMENT_COLOURS.at(index) }} />
              {part.label}{' '}
              <Box component="span" sx={{ fontVariantNumeric: 'tabular-nums', color: 'text.primary' }}>
                {count.format(part.value)}
              </Box>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

const SKELETON_LINES = new Map<NonNullable<SkeletonProps['shape']>, readonly string[]>([
  ['text', ['100%']],
  ['row', ['40%', '70%']],
  ['card', ['50%', '90%', '75%']],
  ['stat', ['35%', '55%']],
]);

/** Grey shapes in the layout of what is loading; screen readers hear that it is loading. */
export function Skeleton({ shape = 'text', count: items = 1 }: SkeletonProps) {
  const labels = useLabels();
  const lines = SKELETON_LINES.get(shape) ?? ['100%'];
  const boxed = shape === 'row' || shape === 'card';
  return (
    <Box role="status" sx={{ display: 'grid', gap: 1.5 }}>
      <Box component="span" sx={srOnly}>
        {labels.loading}
      </Box>
      {Array.from({ length: items }, (_, index) => (
        <Box key={index} aria-hidden="true" sx={{ display: 'grid', gap: 1, ...(boxed && { p: 2, borderRadius: 1.5, border: 1, borderColor: 'divider' }) }}>
          {lines.map((width, line) => (
            <MuiSkeleton key={line} variant="text" width={width} sx={{ fontSize: shape === 'stat' && line === 1 ? '1.75rem' : '1rem' }} />
          ))}
        </Box>
      ))}
    </Box>
  );
}
