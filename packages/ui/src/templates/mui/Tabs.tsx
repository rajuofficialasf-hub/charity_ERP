import MuiTab from '@mui/material/Tab';
import MuiTabs from '@mui/material/Tabs';
import { useId, useState } from 'react';
import type { TabsProps } from '../../contract.js';
import { fill } from '../../provider/messages.js';
import { useUi } from '../../provider/UiProvider.js';
import { cx } from '../../utils/cx.js';

/**
 * Tabs on MUI's tabs (the APG pattern: the arrow keys select, Home and End) with the panel of the
 * chosen tab. More than five tabs become a select on phones (DESIGN_SYSTEM 5.13).
 */
export function Tabs({
  items,
  selectedId,
  defaultSelectedId,
  onChange,
  variant = 'line',
  label,
  className,
}: TabsProps) {
  const { messages, formatNumber } = useUi();
  const base = useId();
  const manyTabs = items.length > 5;
  const [inner, setInner] = useState(defaultSelectedId ?? items[0]?.id);
  const current = selectedId ?? inner;
  const shown = items.find((item) => item.id === current) ?? items[0];
  const tabId = (id: string) => `${base}-tab-${id}`;
  const panelId = (id: string) => `${base}-panel-${id}`;
  const select = (id: string) => {
    setInner(id);
    onChange?.(id);
  };

  return (
    <div className={cx('ui-tabs', `ui-tabs-${variant}`, manyTabs && 'ui-tabs-many', className)}>
      {manyTabs && (
        <label className="ui-tabs-select">
          <span className="ui-sr-only">{messages.nav.sectionSelect}</span>
          <select
            className="ui-native-select"
            value={shown?.id}
            onChange={(e) => select(e.target.value)}
          >
            {items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.count === undefined
                  ? item.label
                  : `${item.label} (${formatNumber(item.count)})`}
              </option>
            ))}
          </select>
        </label>
      )}
      <MuiTabs
        value={shown?.id ?? false}
        onChange={(_, id: string) => select(id)}
        aria-label={label}
        variant="scrollable"
        scrollButtons={false}
        selectionFollowsFocus
        className="ui-tablist"
        slotProps={{ indicator: { className: 'ui-tab-indicator' } }}
      >
        {items.map((item) => (
          <MuiTab
            key={item.id}
            value={item.id}
            id={tabId(item.id)}
            aria-controls={panelId(item.id)}
            className="ui-tab"
            disableRipple
            aria-label={
              item.count === undefined
                ? undefined
                : fill(messages.common.countName, {
                    label: item.label,
                    count: formatNumber(item.count),
                  })
            }
            label={
              <>
                {item.label}
                {item.count !== undefined && (
                  <span className="ui-tab-count ui-tnum" aria-hidden="true">
                    {formatNumber(item.count)}
                  </span>
                )}
              </>
            }
          />
        ))}
      </MuiTabs>
      {shown && (
        <div
          role="tabpanel"
          id={panelId(shown.id)}
          aria-labelledby={tabId(shown.id)}
          // always a tab stop, as the tabs pattern allows: a panel of plain text is still reachable
          tabIndex={0}
          className="ui-tabpanel"
        >
          {shown.content}
        </div>
      )}
    </div>
  );
}
