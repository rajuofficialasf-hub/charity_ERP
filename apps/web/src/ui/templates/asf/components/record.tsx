import type { RecordHeaderProps } from '@/ui/contract';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';

import { Icon } from './icon';
import { srOnly } from './shared';
import { useLabels } from './labels';

// ----------------------------------------------------------------------

/**
 * The head of a record's page on the paper of a card: the picture, the name with its states, a
 * line of facts and two lines of description beside the actions, and the record's tabs along its
 * foot. The actions move under the text when both do not fit, and the picture above the name on a
 * phone; the compact form keeps a small picture beside the name.
 */
export function RecordHeader({ title, headingLevel = 1, media, status, facts, description, actions, actionsLabel, compact = false, footer }: RecordHeaderProps) {
  const labels = useLabels();
  const shownFacts = facts ?? [];
  return (
    <Card sx={{ p: 0, overflow: 'hidden' }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: { xs: 2, md: 3 }, p: compact ? { xs: 2, md: 2.5 } : { xs: 2, md: 3 } }}>
        <Box
          sx={{
            display: 'flex',
            flexDirection: compact ? 'row' : { xs: 'column', sm: 'row' },
            alignItems: compact ? 'center' : { xs: 'stretch', sm: 'center' },
            gap: compact ? 1.5 : { xs: 2, md: 2.5 },
            flex: '1 1 320px',
            minWidth: 0,
          }}
        >
          {media && (
            <Box
              aria-hidden="true"
              sx={{
                flex: 'none',
                overflow: 'hidden',
                bgcolor: 'action.hover',
                ...(compact
                  ? { width: 48, height: 48, borderRadius: 1 }
                  : { width: { xs: '100%', sm: 184 }, height: { xs: 120, sm: 128 }, borderRadius: 1.5 }),
                '& > *': { display: 'block', width: '100%', height: '100%', objectFit: 'cover' },
              }}
            >
              {media}
            </Box>
          )}
          <Box sx={{ minWidth: 0, display: 'grid', gap: compact ? 0.5 : 1 }}>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 1.5, rowGap: 0.5 }}>
              <Box component={headingLevel === 1 ? 'h1' : 'h2'} sx={{ m: 0, typography: compact ? 'h5' : { xs: 'h5', md: 'h4' }, overflowWrap: 'anywhere' }}>
                {title}
              </Box>
              {status}
            </Box>
            {shownFacts.length > 0 && (
              <Box
                component="ul"
                sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 2.5, rowGap: 0.5, m: 0, p: 0, listStyle: 'none', typography: 'body2', color: 'text.secondary' }}
              >
                {shownFacts.map((fact) => (
                  <Box component="li" key={fact.id} sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
                    {fact.icon && <Icon name={fact.icon} size={18} />}
                    <Box component="span" sx={srOnly}>{`${fact.label}: `}</Box>
                    <Box component="span" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                      {fact.value}
                    </Box>
                  </Box>
                ))}
              </Box>
            )}
            {!compact && description && (
              <Box
                component="p"
                title={description}
                sx={{ m: 0, typography: 'body2', color: 'text.secondary', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
              >
                {description}
              </Box>
            )}
          </Box>
        </Box>
        {actions && (
          <Box
            role="region"
            aria-label={actionsLabel ?? labels.actions}
            sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: { md: 'flex-end' }, gap: 1, flex: '0 1 auto' }}
          >
            {actions}
          </Box>
        )}
      </Box>
      {footer && <Box sx={{ borderTop: 1, borderColor: 'divider', px: { xs: 1, md: 3 } }}>{footer}</Box>}
    </Card>
  );
}
