import { Alert, Button, Text } from '@/ui';
import { useTranslations } from 'use-intl';
import { ApiFailure } from '../lib/api';
import { failedOnTheWay } from '../lib/or-cached';

/**
 * A read that failed, with a way to try again: without network the read never reached the server,
 * so it says so rather than "something went wrong"; a server error shows its request id for the
 * support team. `title` names what could not be read when several reads fail side by side.
 */
export function LoadError({
  error,
  onRetry,
  title,
}: {
  error: unknown;
  onRetry: () => void;
  title?: string;
}) {
  const tc = useTranslations('common');
  const requestId = error instanceof ApiFailure ? error.requestId : undefined;
  return (
    <Alert
      tone="error"
      title={title}
      action={
        <Button variant="secondary" size="small" onClick={onRetry}>
          {tc('action.retry')}
        </Button>
      }
    >
      {!navigator.onLine && failedOnTheWay(error)
        ? tc('state.offline.text')
        : tc('state.error.text')}
      {requestId && <Text size="small">{tc('state.error.request_id', { id: requestId })}</Text>}
    </Alert>
  );
}
