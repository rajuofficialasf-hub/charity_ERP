import type {
  Tone,
  StatusKey,
  ColorTone,
  BulkRowProps,
  OfflineState,
  BulkListProps,
  DisclosureProps,
  IconButtonProps,
  StatusChipProps,
  ChoiceTilesProps,
  ExtendedIconName,
  ChoiceTileGroup,
  AttentionCardProps,
  OfflineBannerProps,
  StatFilterBarProps,
} from '@/ui/contract';

import { Link as RouterLink } from 'react-router';
import { useId, useRef, useState, useEffect } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Button from '@mui/material/Button';
import Tooltip from '@mui/material/Tooltip';
import ButtonBase from '@mui/material/ButtonBase';
import MuiIconButton from '@mui/material/IconButton';
import FormHelperText from '@mui/material/FormHelperText';
import CardActionArea from '@mui/material/CardActionArea';

import { Icon } from './icon';
import { Menu } from './menu';
import { Checkbox } from './choices';
import { IconTile } from './people';
import { fill, useLabels } from './labels';
import { count, srOnly, appPath } from './shared';

// ----------------------------------------------------------------------

/** The soft tint behind a tone's darkest ink; light ink in dark mode. */
function soft(tone: ColorTone) {
  if (tone === 'neutral') return { bgcolor: 'action.hover', color: 'text.primary' };
  // the darkest shade reads on the tint in light mode; the light shade takes over in dark mode
  return { bgcolor: `rgba(var(--asf-palette-${tone}-mainChannel) / 0.16)`, color: `${tone}.darker` };
}

const STATUS_LOOK = new Map<StatusKey, { tone: ColorTone; icon: ExtendedIconName }>([
  ['draft', { tone: 'neutral', icon: 'edit' }],
  ['needs_verification', { tone: 'warning', icon: 'warning' }],
  ['submitted', { tone: 'info', icon: 'send' }],
  ['under_review', { tone: 'info', icon: 'search' }],
  ['reviewed', { tone: 'info', icon: 'check' }],
  ['waitlisted', { tone: 'warning', icon: 'hourglass' }],
  ['approved', { tone: 'success', icon: 'success' }],
  ['rejected', { tone: 'error', icon: 'rejected' }],
  ['implementation', { tone: 'primary', icon: 'briefcase' }],
  ['completed', { tone: 'success', icon: 'star' }],
  ['closed', { tone: 'neutral', icon: 'lock' }],
  ['deleted', { tone: 'neutral', icon: 'delete' }],
  ['sync_pending', { tone: 'neutral', icon: 'clock' }],
  ['sync_syncing', { tone: 'info', icon: 'refresh' }],
  ['sync_synced', { tone: 'success', icon: 'check' }],
  ['sync_failed', { tone: 'error', icon: 'error' }],
  ['photo_verified', { tone: 'success', icon: 'shield' }],
  ['photo_flagged', { tone: 'warning', icon: 'warning' }],
  ['photo_pending', { tone: 'neutral', icon: 'cloud-upload' }],
  ['blocklisted', { tone: 'error', icon: 'block' }],
]);

/** A state as a soft chip with its icon and its words. */
export function StatusChip({ status, label, size = 'small', lang }: StatusChipProps) {
  const look = STATUS_LOOK.get(status) ?? { tone: 'neutral', icon: 'info' };
  return (
    <Box
      component="span"
      data-status={status}
      lang={lang}
      sx={(theme) => ({
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.5,
        px: 1,
        py: size === 'small' ? 0.25 : 0.5,
        borderRadius: 0.75,
        typography: size === 'small' ? 'caption' : 'body2',
        fontWeight: 700,
        whiteSpace: 'nowrap',
        ...soft(look.tone),
        ...theme.applyStyles('dark', { color: look.tone === 'neutral' ? 'text.primary' : `${look.tone}.light` }),
      })}
    >
      <Icon name={look.icon} size={size === 'small' ? 14 : 16} />
      {label}
    </Box>
  );
}

/** Counts above a list that filter it when chosen; the counts past `visible` sit behind a last card. */
export function StatFilterBar({ label, items, selectedId, onSelect, visible = items.length, moreLabel, moreValue, loading }: StatFilterBarProps) {
  const shown = items.slice(0, visible);
  // the counts behind the last card; one that does not filter is listed but cannot be chosen
  const hidden = items.slice(visible);
  const chosenHidden = hidden.find((item) => item.id === selectedId);
  const card = (pressed: boolean) => ({
    display: 'flex',
    alignItems: 'center',
    gap: 1.5,
    width: '100%',
    p: 2,
    borderRadius: 2,
    border: 1,
    borderColor: pressed ? 'primary.main' : 'divider',
    bgcolor: pressed ? 'rgba(var(--asf-palette-primary-mainChannel) / 0.08)' : 'background.paper',
    textAlign: 'left',
    justifyContent: 'flex-start',
  });
  return (
    <Box
      role="group"
      aria-label={label}
      aria-busy={loading || undefined}
      sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}
    >
      {shown.map((item) => {
        const pressed = item.id === selectedId;
        const content = (
          <>
            <IconTile icon={item.icon} tone={item.tone ?? 'neutral'} />
            <Box sx={{ minWidth: 0 }}>
              <Box component="span" sx={{ display: 'block', typography: 'body2', color: pressed ? 'text.primary' : 'text.secondary' }}>
                {item.label}
              </Box>{' '}
              <Box component="span" sx={{ display: 'block', typography: 'h5', fontVariantNumeric: 'tabular-nums' }}>
                {loading ? '—' : count.format(item.value)}
              </Box>
            </Box>
          </>
        );
        return item.selectable === false || !onSelect ? (
          <Box key={item.id} sx={card(false)}>
            {content}
          </Box>
        ) : (
          <ButtonBase key={item.id} aria-pressed={pressed} onClick={() => onSelect(item.id)} sx={card(pressed)}>
            {content}
          </ButtonBase>
        );
      })}
      {hidden.length > 0 && (
        <Box sx={{ ...card(Boolean(chosenHidden)), p: 1 }}>
          <Menu
            label={chosenHidden ? `${moreLabel}: ${chosenHidden.label} ${count.format(chosenHidden.value)}` : moreLabel}
            items={hidden.map((item) => ({
              id: item.id,
              label: `${item.label} ${count.format(item.value)}`,
              disabled: item.selectable === false || !onSelect,
              onSelect: () => onSelect?.(item.id),
            }))}
          >
            <Box component="span" sx={{ display: 'grid', textAlign: 'left' }}>
              <Box component="span" sx={{ typography: 'body2', color: 'text.secondary' }}>
                {chosenHidden ? chosenHidden.label : moreLabel}
              </Box>
              <Box component="span" sx={{ typography: 'h6', fontVariantNumeric: 'tabular-nums' }}>
                {chosenHidden ? count.format(chosenHidden.value) : moreValue(hidden.length)}
              </Box>
            </Box>
          </Menu>
        </Box>
      )}
    </Box>
  );
}

const BANNER = new Map<OfflineState, { tone: Tone; icon: ExtendedIconName; words: 'offline' | 'backOnline' | 'syncing' | 'syncFailed' }>([
  ['offline', { tone: 'warning', icon: 'offline', words: 'offline' }],
  ['back_online', { tone: 'success', icon: 'success', words: 'backOnline' }],
  ['syncing', { tone: 'info', icon: 'refresh', words: 'syncing' }],
  ['sync_failed', { tone: 'error', icon: 'error', words: 'syncFailed' }],
]);

function BannerBody({ state, pendingCount, onOpenOutbox, onHidden, text, label }: OfflineBannerProps) {
  const labels = useLabels();
  const [hidden, setHidden] = useState(false);
  // the latest callback, so a page that renders again does not restart the 4 seconds
  const latest = useRef(onHidden);
  useEffect(() => {
    latest.current = onHidden;
  });
  useEffect(() => {
    if (state !== 'back_online') return undefined;
    const timer = setTimeout(() => {
      setHidden(true);
      latest.current?.();
    }, 4000);
    return () => clearTimeout(timer);
  }, [state]);
  if (hidden) return null;
  const look = BANNER.get(state) ?? { tone: 'info', icon: 'info', words: 'syncing' };
  return (
    <Box
      role="region"
      aria-label={label ?? labels.connectionStatus}
      sx={(theme) => ({
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 1.5,
        px: 2,
        py: 1,
        ...soft(look.tone),
        ...theme.applyStyles('dark', { color: `${look.tone}.light` }),
      })}
    >
      <Icon name={look.icon} size={20} />
      <Box component="p" role="status" sx={{ m: 0, flex: 1, minWidth: 0, typography: 'body2', fontWeight: 600 }}>
        {text ?? labels[look.words]}
      </Box>
      {pendingCount !== undefined && pendingCount > 0 && (
        <Box component="span" sx={{ typography: 'caption', fontVariantNumeric: 'tabular-nums' }}>
          {fill(labels.pendingSync, { count: count.format(pendingCount) })}
        </Box>
      )}
      {onOpenOutbox && (
        <Button size="small" color="inherit" onClick={onOpenOutbox} sx={{ fontWeight: 700 }}>
          {labels.openOutbox}
        </Button>
      )}
    </Box>
  );
}

/** The connection and sync state; a new state shows again even after "back online" has hidden. */
export function OfflineBanner(props: OfflineBannerProps) {
  return <BannerBody key={props.state} {...props} />;
}

/** A part of a page that opens and closes by its title. */
export function Disclosure({ title, hint, icon, defaultOpen = false, open: given, onToggle, headingLevel = 3, children }: DisclosureProps) {
  const [own, setOwn] = useState(defaultOpen);
  const open = given ?? own;
  const toggleId = useId();
  const bodyId = useId();
  const heading = (`h${headingLevel}` as 'h2' | 'h3' | 'h4');
  return (
    <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
      <Box component={heading} sx={{ m: 0 }}>
        <ButtonBase
          id={toggleId}
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => {
            setOwn(!open);
            onToggle?.(!open);
          }}
          sx={{ width: '100%', justifyContent: 'flex-start', gap: 1, py: 1.5, typography: 'subtitle1', textAlign: 'left' }}
        >
          {icon && <Icon name={icon} size={20} />}
          <Box component="span" sx={{ flex: 1 }}>
            {title}
          </Box>
          {hint && (
            <Box component="span" sx={{ typography: 'caption', color: 'text.secondary' }}>
              {hint}
            </Box>
          )}
          <Box component="span" aria-hidden sx={{ display: 'inline-flex', transform: open ? 'rotate(180deg)' : undefined, transition: 'transform 0.2s' }}>
            <Icon name="chevron-down" size={20} />
          </Box>
        </ButtonBase>
      </Box>
      <Box id={bodyId} role="region" aria-labelledby={toggleId} hidden={!open} sx={{ pb: 2 }}>
        {children}
      </Box>
    </Box>
  );
}

const isGroups = (tiles: ChoiceTilesProps['tiles']): tiles is readonly ChoiceTileGroup[] => tiles.length > 0 && 'tiles' in (tiles[0] as object);

/** One choice among a few larger tiles, each saying what it means; native radios under the tiles. */
export function ChoiceTiles({ label, name, error, hint, required, disabled, tiles, value, onChange, columns = 2 }: ChoiceTilesProps) {
  const labelId = useId();
  const noteId = useId();
  const groupName = useId();
  const groups: readonly ChoiceTileGroup[] = isGroups(tiles) ? tiles : [{ title: '', tiles }];
  return (
    <Box role="radiogroup" aria-labelledby={labelId} aria-describedby={error || hint ? noteId : undefined} aria-required={required || undefined} aria-invalid={error ? true : undefined} sx={{ display: 'grid', gap: 1.5 }}>
      <Box id={labelId} sx={{ typography: 'subtitle2' }}>
        {label}
      </Box>
      {groups.map((group) => (
        <Box key={group.title || 'tiles'} sx={{ display: 'grid', gap: 1 }}>
          {group.title && <Box sx={{ typography: 'overline', color: 'text.secondary' }}>{group.title}</Box>}
          <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: columns === 2 ? 'repeat(2, minmax(0, 1fr))' : '1fr' } }}>
            {group.tiles.map((tile) => {
              const checked = tile.id === value;
              const off = disabled || tile.disabled;
              return (
                <Box
                  component="label"
                  key={tile.id}
                  sx={{
                    position: 'relative',
                    display: 'flex',
                    gap: 1.5,
                    alignItems: 'flex-start',
                    p: 2,
                    borderRadius: 2,
                    border: 1,
                    borderColor: checked ? 'primary.main' : 'divider',
                    bgcolor: checked ? 'rgba(var(--asf-palette-primary-mainChannel) / 0.08)' : 'background.paper',
                    cursor: off ? 'not-allowed' : 'pointer',
                    opacity: off ? 0.56 : 1,
                    '&:has(input:focus-visible)': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
                  }}
                >
                  <Box component="input" type="radio" name={name ?? groupName} value={tile.id} checked={checked} disabled={off} onChange={() => onChange(tile.id)} sx={srOnly} />
                  {tile.icon && <IconTile icon={tile.icon} tone={checked ? 'primary' : 'neutral'} size="small" />}
                  <Box sx={{ minWidth: 0 }}>
                    <Box component="span" sx={{ display: 'block', typography: 'subtitle2' }}>
                      {tile.title}
                    </Box>
                    {tile.description && (
                      <Box component="span" sx={{ display: 'block', typography: 'body2', color: checked ? 'text.primary' : 'text.secondary' }}>
                        {tile.description}
                      </Box>
                    )}
                  </Box>
                </Box>
              );
            })}
          </Box>
        </Box>
      ))}
      {(error || hint) && (
        <FormHelperText id={noteId} error={Boolean(error)}>
          {error ?? hint}
        </FormHelperText>
      )}
    </Box>
  );
}

/** The list of a day's rows, with "select all remaining" and the count chosen. */
export function BulkList({ label, selectAllLabel, allSelected, someSelected, onSelectAll, selectedCount, children }: BulkListProps) {
  const labels = useLabels();
  return (
    <Box sx={{ display: 'grid', gap: 1 }}>
      {(onSelectAll || selectedCount !== undefined) && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1 }}>
          {onSelectAll && (
            <Checkbox label={selectAllLabel} ariaLabel={selectAllLabel ?? labels.selectAll} checked={Boolean(allSelected)} indeterminate={!allSelected && someSelected} onChange={onSelectAll} />
          )}
          {selectedCount !== undefined && selectedCount > 0 && (
            <Box component="span" role="status" sx={{ ml: 'auto', typography: 'subtitle2', fontVariantNumeric: 'tabular-nums' }}>
              {fill(labels.selectedCount, { count: selectedCount })}
            </Box>
          )}
        </Box>
      )}
      <Box component="ul" aria-label={label} sx={{ m: 0, p: 0, listStyle: 'none', display: 'grid', gap: 1 }}>
        {children}
      </Box>
    </Box>
  );
}

/** One row of a day's work: choose it, act on it at once, or open its details. */
export function BulkRow({ title, meta, selected, onSelect, state, photoState, syncState, quickAction, menuActions, expanded: given, onExpandedChange, children }: BulkRowProps) {
  const labels = useLabels();
  const [own, setOwn] = useState(false);
  const expanded = given ?? own;
  const detailsId = useId();
  return (
    <Box
      component="li"
      sx={{
        p: 1.5,
        borderRadius: 2,
        border: 1,
        borderColor: selected ? 'primary.main' : 'divider',
        bgcolor: selected ? 'rgba(var(--asf-palette-primary-mainChannel) / 0.08)' : 'background.paper',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
        {onSelect && <Checkbox ariaLabel={title} checked={Boolean(selected)} onChange={onSelect} />}
        <Box sx={{ flex: 1, minWidth: 0, pt: 0.75 }}>
          <Box sx={{ typography: 'subtitle2' }}>{title}</Box>
          {meta && <Box sx={{ typography: 'caption', color: selected ? 'text.primary' : 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>{meta}</Box>}
          {(state || photoState || syncState) && (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 0.75 }}>
              {state && <StatusChip status={state.status} label={state.label} />}
              {photoState && <StatusChip status={photoState.status} label={photoState.label} />}
              {syncState && <StatusChip status={syncState.status} label={syncState.label} />}
            </Box>
          )}
        </Box>
        {children && (
          <MuiIconButton
            aria-label={expanded ? labels.hideDetails : labels.showDetails}
            aria-expanded={expanded}
            aria-controls={detailsId}
            onClick={() => {
              setOwn(!expanded);
              onExpandedChange?.(!expanded);
            }}
          >
            <Box component="span" sx={{ display: 'inline-flex', transform: expanded ? 'rotate(180deg)' : undefined }}>
              <Icon name="chevron-down" size={20} />
            </Box>
          </MuiIconButton>
        )}
      </Box>
      {(quickAction || (menuActions && menuActions.length > 0)) && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1, pl: onSelect ? 5 : 0 }}>
          {quickAction && (
            <Button
              variant="outlined"
              color="inherit"
              size="small"
              disabled={quickAction.disabled}
              onClick={quickAction.onClick}
              startIcon={quickAction.icon ? <Icon name={quickAction.icon} size={18} /> : undefined}
            >
              {quickAction.label}
            </Button>
          )}
          {menuActions && menuActions.length > 0 && <Menu label={`${labels.moreActions}: ${title}`} items={menuActions} />}
        </Box>
      )}
      {children && (
        <Box id={detailsId} hidden={!expanded} sx={{ mt: 1.5, pl: onSelect ? 5 : 0 }}>
          {children}
        </Box>
      )}
    </Box>
  );
}

/** An item that needs the person, with why and how long; the whole card links to its list, or carries one action. */
export function AttentionCard({ tone = 'info', icon, title, reason, meta, to, action }: AttentionCardProps) {
  const path = appPath(to);
  const body = (
    <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start', p: 2 }}>
      <IconTile icon={icon} tone={tone} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box component="span" sx={{ display: 'block', typography: 'subtitle2' }}>
          {title}
        </Box>
        {reason && (
          <Box component="span" sx={{ display: 'block', typography: 'body2', color: 'text.secondary' }}>
            {reason}
          </Box>
        )}
        {meta && (
          <Box component="span" sx={{ display: 'block', typography: 'caption', color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
            {meta}
          </Box>
        )}
      </Box>
      {!path && action}
      {path && (
        <Box component="span" aria-hidden sx={{ alignSelf: 'center', color: 'text.secondary', display: 'inline-flex' }}>
          <Icon name="chevron-right" size={20} />
        </Box>
      )}
    </Box>
  );
  return (
    <Card sx={{ borderLeft: 4, borderColor: `${tone}.main` }}>
      {path ? (
        <CardActionArea component={RouterLink} to={path}>
          {body}
        </CardActionArea>
      ) : (
        body
      )}
    </Card>
  );
}

/** A button that shows only its icon; its label is its name and its tooltip. */
export function IconButton({ label, icon, onClick, disabled, tone = 'default', size = 'medium' }: IconButtonProps) {
  const button = (
    <MuiIconButton aria-label={label} onClick={onClick} disabled={disabled} size={size} sx={tone === 'danger' ? { color: 'error.main' } : undefined}>
      <Icon name={icon} size={size === 'small' ? 18 : 20} />
    </MuiIconButton>
  );
  return disabled ? button : <Tooltip title={label}>{button}</Tooltip>;
}
