import { StatCard } from '@css/ui';

/** One count above a nationwide tab. */
export interface Statistic {
  key: string;
  label: string;
  value: number;
}

/**
 * The counts above a tab (the volunteer and the beneficiary tab): a row of stat cards that wraps on
 * a phone. A count the caller may not see is not in the server's answer and so not passed here.
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
        <StatCard key={item.key} label={item.label} value={item.value} loading={loading} />
      ))}
    </section>
  );
}
