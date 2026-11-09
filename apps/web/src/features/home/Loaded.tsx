import { EmptyState, type IconName, Skeleton } from '@/ui';
import type { UseQueryResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { LoadError } from '../../components/LoadError';

/** The loading, error and empty states every data widget of the home shares. */
export function Loaded<T>({
  query,
  empty,
  emptyIcon,
  isEmpty,
  children,
}: {
  query: UseQueryResult<T>;
  empty: string;
  emptyIcon?: IconName;
  isEmpty: (data: T) => boolean;
  children: (data: T) => ReactNode;
}) {
  if (query.isPending) return <Skeleton shape="card" />;
  if (query.error) return <LoadError error={query.error} onRetry={() => void query.refetch()} />;
  return isEmpty(query.data) ? <EmptyState icon={emptyIcon} title={empty} /> : children(query.data);
}
