import { ChevronDown } from 'lucide-react';
import { useUi } from '../../provider/UiProvider.js';
import { cx } from '../../utils/cx.js';
import { Icon, type IconComponent } from '../Icon/Icon.js';
import { MenuButton } from '../Menu/MenuButton.js';
import { Skeleton } from '../Skeleton/Skeleton.js';

export interface StatFilterItem {
  id: string;
  label: string;
  value: number;
  icon: IconComponent;
  /** The colour of the icon tile; neutral by default. */
  tone?: 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info';
  /** false for a count that is not a filter of the list (shown, never chosen). */
  selectable?: boolean;
}

export interface StatFilterBarProps {
  /** Accessible name of the group of counts. */
  label: string;
  items: StatFilterItem[];
  /** The chosen count, which filters the list. */
  selectedId?: string;
  onSelect?: (id: string) => void;
  /** How many counts show as cards; the rest sit behind the last card. */
  visible?: number;
  /** The label of the last card that holds the rest ("more states"). */
  moreLabel: string;
  /** The count of the rest as the last card shows it ("4টি"). */
  moreValue: (hidden: number) => string;
  loading?: boolean;
  className?: string;
}

function CardContent({
  item,
  value,
}: {
  item: Pick<StatFilterItem, 'label' | 'icon' | 'tone'>;
  value: string;
}) {
  return (
    <>
      <span className={cx('ui-statfilter-icon', `t-${item.tone ?? 'neutral'}`)} aria-hidden="true">
        <Icon icon={item.icon} size="md" />
      </span>
      <span className="ui-statfilter-text">
        <span className="ui-statfilter-label">{item.label}</span>
        {/* a space, so the label and the number are read as two words */}{' '}
        <span className="ui-statfilter-value">{value}</span>
      </span>
    </>
  );
}

/**
 * Counts above a list that are also its filter: each card shows an icon, a label and a number, the
 * chosen one is outlined; the counts beyond `visible` sit behind a last card that opens a menu.
 */
export function StatFilterBar({
  label,
  items,
  selectedId,
  onSelect,
  visible = 5,
  moreLabel,
  moreValue,
  loading = false,
  className,
}: StatFilterBarProps) {
  const { formatNumber } = useUi();
  if (loading)
    return (
      <div className={cx('ui-statfilter', className)} aria-busy="true">
        {Array.from({ length: visible + 1 }, (_, i) => (
          <Skeleton key={i} shape="stat" />
        ))}
      </div>
    );
  const shown = items.slice(0, visible);
  const hidden = items.slice(visible);
  const chosenHidden = hidden.find((item) => item.id === selectedId);
  return (
    <div role="group" aria-label={label} className={cx('ui-statfilter', className)}>
      {shown.map((item) => {
        const selectable = item.selectable !== false;
        const selected = selectable && item.id === selectedId;
        return selectable ? (
          <button
            key={item.id}
            type="button"
            className="ui-statfilter-card"
            aria-pressed={selected}
            onClick={() => onSelect?.(item.id)}
          >
            <CardContent item={item} value={formatNumber(item.value)} />
          </button>
        ) : (
          <div key={item.id} className="ui-statfilter-card is-static">
            <CardContent item={item} value={formatNumber(item.value)} />
          </div>
        );
      })}
      {hidden.length > 0 && (
        <MenuButton
          label={chosenHidden ? `${moreLabel}: ${chosenHidden.label}` : moreLabel}
          className={cx('ui-statfilter-card', 'ui-statfilter-more', chosenHidden && 'is-chosen')}
          items={hidden.map((item) => ({
            id: item.id,
            label: `${item.label} · ${formatNumber(item.value)}`,
            icon: item.icon,
            ...(item.selectable === false ? {} : { onAction: () => onSelect?.(item.id) }),
          }))}
        >
          <CardContent
            item={chosenHidden ?? { label: moreLabel, icon: ChevronDown, tone: 'neutral' as const }}
            value={chosenHidden ? formatNumber(chosenHidden.value) : moreValue(hidden.length)}
          />
        </MenuButton>
      )}
    </div>
  );
}
