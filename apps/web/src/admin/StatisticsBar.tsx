import { type IconComponent, type IconTileTone, StatCard } from '@css/ui';

/** One count above a list. */
export interface Statistic {
  key: string;
  label: string;
  value: number;
  icon?: IconComponent;
  tone?: IconTileTone;
}

/**
 * The counts above a list: a row of stat cards, four across on a wide screen and two on a phone. A count the caller may not see is not in the server's answer and so not passed here.
 */
export function StatisticsBar({
  label,
  items,
  loading,
}: {
  label: string;
  items: Statistic[];
  loading?: boolean;
}) {
  return (
    <section aria-label={label} className="admin-stats">
      {items.map((item) => (
        <StatCard
          key={item.key}
          label={item.label}
          value={item.value}
          icon={item.icon}
          tone={item.tone}
          loading={loading}
        />
      ))}
    </section>
  );
}
