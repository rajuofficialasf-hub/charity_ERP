'use client';

import { useId, type ReactNode } from 'react';
import { ChevronDown, EllipsisVertical } from 'lucide-react';
import { fill } from '../../provider/messages.js';
import { useUi } from '../../provider/UiProvider.js';
import { cx } from '../../utils/cx.js';
import { StatusBadge, type StatusKey } from '../Badge/Badge.js';
import { Button } from '../Button/Button.js';
import { Checkbox } from '../Field/Choice.js';
import { Icon, type IconComponent } from '../Icon/Icon.js';
import { MenuButton } from '../Menu/MenuButton.js';

export interface BulkBadge {
  status: StatusKey;
  label: string;
}

export interface BulkRowProps {
  /** Beneficiary name. */
  title: string;
  /** App number and village, prepared by the caller. */
  meta?: string;
  selected?: boolean;
  onSelect?: (selected: boolean) => void;
  /** Activity state, photo state and sync state badges (icon plus label). */
  state?: BulkBadge;
  photoState?: BulkBadge;
  syncState?: BulkBadge;
  /** The one main action, for example "distributed" (a secondary button). */
  quickAction?: { label: string; icon?: IconComponent; onPress: () => void; disabled?: boolean };
  /** Edge states (absent, later, not distributed, damaged, partial; BD-23), applied per row. */
  menuActions?: { id: string; label: string; onAction: () => void }[];
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  /** Inline detail for quantities and a note. */
  children?: ReactNode;
  className?: string;
}

/** Row of the bulk-update screens (DESIGN_SYSTEM 5.17, 6.1): at least 56 px, 44 px checkbox area. */
export function BulkRow({
  title,
  meta,
  selected = false,
  onSelect,
  state,
  photoState,
  syncState,
  quickAction,
  menuActions,
  expanded = false,
  onExpandedChange,
  children,
  className,
}: BulkRowProps) {
  const { messages } = useUi();
  const detailId = useId();
  const badges = [state, photoState, syncState].filter((b): b is BulkBadge => !!b);
  return (
    <li className={cx('ui-bulk-row', selected && 'is-selected', className)}>
      <div className="ui-bulk-main">
        {onSelect ? (
          <Checkbox
            hitArea
            isSelected={selected}
            onChange={onSelect}
            aria-label={fill(messages.table.selectRow, { name: title })}
          />
        ) : (
          <span className="ui-bulk-spacer" />
        )}
        <div className="ui-bulk-text">
          <p className="ui-bulk-title">{title}</p>
          {meta && <p className="ui-bulk-meta ui-tnum">{meta}</p>}
          {badges.length > 0 && (
            <div className="ui-bulk-states">
              {badges.map((badge) => (
                <StatusBadge
                  key={badge.status}
                  status={badge.status}
                  label={badge.label}
                  size="sm"
                />
              ))}
            </div>
          )}
        </div>
        <div className="ui-bulk-actions">
          {quickAction && (
            <Button
              variant="secondary"
              size="sm"
              icon={quickAction.icon}
              onPress={quickAction.onPress}
              disabled={quickAction.disabled}
            >
              {quickAction.label}
            </Button>
          )}
          {menuActions && menuActions.length > 0 && (
            <MenuButton
              label={`${messages.bulk.moreActions}: ${title}`}
              icon={EllipsisVertical}
              items={menuActions}
            />
          )}
          {children !== undefined && onExpandedChange && (
            <button
              type="button"
              className="ui-icon-button ui-bulk-expand"
              aria-expanded={expanded}
              aria-controls={detailId}
              aria-label={expanded ? messages.bulk.hideDetails : messages.bulk.showDetails}
              onClick={() => onExpandedChange(!expanded)}
            >
              <Icon icon={ChevronDown} />
            </button>
          )}
        </div>
      </div>
      {children !== undefined && (
        <div id={detailId} className="ui-bulk-detail" hidden={!expanded}>
          {children}
        </div>
      )}
    </li>
  );
}

export interface BulkListProps {
  /** Accessible name of the list ("today's distribution"). */
  label: string;
  /** Header checkbox for "select all remaining". */
  selectAllLabel?: string;
  allSelected?: boolean;
  someSelected?: boolean;
  onSelectAll?: (selected: boolean) => void;
  selectedCount?: number;
  children: ReactNode;
  className?: string;
}

/** List of bulk rows with a "select all remaining" header and the selected count. */
export function BulkList({
  label,
  selectAllLabel,
  allSelected = false,
  someSelected = false,
  onSelectAll,
  selectedCount = 0,
  children,
  className,
}: BulkListProps) {
  const { messages, formatNumber } = useUi();
  return (
    <div className={cx('ui-bulk-list', className)}>
      {onSelectAll && (
        <div className="ui-bulk-head">
          <Checkbox
            hitArea
            isSelected={allSelected}
            isIndeterminate={!allSelected && someSelected}
            onChange={onSelectAll}
          >
            {selectAllLabel ?? messages.table.selectAll}
          </Checkbox>
          <span className="ui-bulk-count ui-tnum" role="status">
            {selectedCount > 0
              ? fill(messages.bulk.selectedCount, { count: formatNumber(selectedCount) })
              : ''}
          </span>
        </div>
      )}
      <ul className="ui-bulk-rows" aria-label={label}>
        {children}
      </ul>
    </div>
  );
}
