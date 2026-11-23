import { type ColorTone, type ExtendedIconName, Skeleton, StatCard } from '@/ui';

/** One count above a list. */
export interface Statistic {
  key: string;
  label: string;
  /** A count, or a capped count such as "10000+" as the server gives it. */
  value: number | string;
  icon?: ExtendedIconName;
  tone?: ColorTone;
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
    <section aria-label={label} aria-busy={loading || undefined} className="admin-stats">
      {items.map((item) => (
        <StatCard
          key={item.key}
          label={item.label}
          value={loading ? <Skeleton shape="text" /> : item.value}
          icon={item.icon}
          tone={item.tone}
        />
      ))}
    </section>
  );
}
