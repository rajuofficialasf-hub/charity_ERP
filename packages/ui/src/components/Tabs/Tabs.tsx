'use client';

import { useState, type ReactNode } from 'react';
import { Tab, TabList, TabPanel, Tabs as AriaTabs, type Key } from 'react-aria-components';
import { fill } from '../../provider/messages.js';
import { useUi } from '../../provider/UiProvider.js';
import { cx } from '../../utils/cx.js';

export interface TabItem {
  id: string;
  label: string;
  /** Count shown beside the label (English digits through the formatter). */
  count?: number;
  content: ReactNode;
}

export interface TabsProps {
  items: TabItem[];
  /** Controlled selection; keep it in the URL for shareable views (DESIGN_SYSTEM 5.13). */
  selectedId?: string;
  defaultSelectedId?: string;
  onChange?: (id: string) => void;
  /** line (default) or segmented for two or three short options. */
  variant?: 'line' | 'segmented';
  /** Accessible name of the tab list. */
  label: string;
  className?: string;
}

/**
 * Tabs on the APG pattern (arrow keys, Home, End). More than five tabs become a select on phones
 * (DESIGN_SYSTEM 5.13).
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
  const manyTabs = items.length > 5;
  const [inner, setInner] = useState(defaultSelectedId ?? items[0]?.id);
  const current = selectedId ?? inner;
  const select = (id: string) => {
    setInner(id);
    onChange?.(id);
  };

  return (
    <AriaTabs
      className={cx('ui-tabs', `ui-tabs-${variant}`, manyTabs && 'ui-tabs-many', className)}
      selectedKey={current}
      onSelectionChange={(key: Key) => select(String(key))}
    >
      {manyTabs && (
        <label className="ui-tabs-select">
          <span className="ui-sr-only">{messages.nav.sectionSelect}</span>
          <select
            className="ui-native-select"
            value={current}
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
      <TabList className="ui-tablist" aria-label={label}>
        {items.map((item) => (
          <Tab
            key={item.id}
            id={item.id}
            className="ui-tab"
            aria-label={
              item.count === undefined
                ? undefined
                : fill(messages.common.countName, {
                    label: item.label,
                    count: formatNumber(item.count),
                  })
            }
          >
            {item.label}
            {item.count !== undefined && (
              <span className="ui-tab-count ui-tnum" aria-hidden="true">
                {formatNumber(item.count)}
              </span>
            )}
          </Tab>
        ))}
      </TabList>
      {items.map((item) => (
        <TabPanel key={item.id} id={item.id} className="ui-tabpanel">
          {item.content}
        </TabPanel>
      ))}
    </AriaTabs>
  );
}
