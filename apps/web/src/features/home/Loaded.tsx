import { EmptyState, ErrorState, type IconComponent, Skeleton } from '@css/ui';
import type { UseQueryResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useTranslations } from 'use-intl';
import { ApiFailure } from '../../lib/api';
import { failedOnTheWay } from '../../lib/or-cached';

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
  emptyIcon?: IconComponent;
  isEmpty: (data: T) => boolean;
  children: (data: T) => ReactNode;
}) {
  const tc = useTranslations('common');
  if (query.isPending) return <Skeleton shape="card" />;
  if (query.error)
    return (
      <ErrorState
        // without network the read never reached the server: say so, not "something went wrong"
        title={
          !navigator.onLine && failedOnTheWay(query.error)
            ? tc('state.offline.text')
            : tc('state.error.text')
        }
        requestId={query.error instanceof ApiFailure ? query.error.requestId : undefined}
        onRetry={() => void query.refetch()}
      />
    );
  return isEmpty(query.data) ? <EmptyState icon={emptyIcon} title={empty} /> : children(query.data);
}
