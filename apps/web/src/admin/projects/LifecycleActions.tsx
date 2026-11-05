import { type ProjectAction, transitionFor } from '@css/shared/projects';
import { Alert, Button } from '@/ui';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { ApiFailure } from '../../lib/api';
import { cancelProject, type LifecycleAction, moveProject, type Project } from './projects-api';
import { ReasonDialog } from './ReasonDialog';
import { useMissingLabel } from './setup/missing';

/** A lifecycle move, or the deadline extension of an active project. */
type Move = ProjectAction | 'extend';

const ROUTE = new Map<Move, LifecycleAction>([
  ['activate', 'activate'],
  ['extend', 'extend-deadline'],
  ['start_closing', 'start-closing'],
  ['close', 'close'],
  ['reopen', 'reopen'],
]);

/** The moves this state allows, in the order they show (the extension is a move of an active project). */
function movesFor(status: Project['status']): Move[] {
  const order: Move[] = ['activate', 'extend', 'start_closing', 'close', 'reopen', 'cancel'];
  return order.filter((move) =>
    move === 'extend' ? status === 'active' : transitionFor(move, status) !== null,
  );
}

/**
 * The lifecycle buttons of a project for the PM and the global roles: activate a complete draft,
 * cancel a draft, extend the deadline, start closing, close, reopen. Every move but activation asks
 * for a reason; the server checks each move again. A refused activation lists what is missing.
 */
export function LifecycleActions({
  project,
  etag,
  onMoved,
}: {
  project: Project;
  etag: string;
  onMoved: () => void;
}) {
  const t = useTranslations('admin.projects.lifecycle');
  const missingLabel = useMissingLabel();
  const [asking, setAsking] = useState<Move | null>(null);
  const move = useMutation({
    mutationFn: ({ to, input }: { to: Move; input?: { reason: string; newApplyTo?: string } }) =>
      to === 'cancel'
        ? cancelProject(project.id, input!.reason)
        : moveProject(project.id, ROUTE.get(to)!, etag, input),
    onSuccess: () => {
      setAsking(null);
      onMoved();
    },
  });
  const moves = movesFor(project.status);
  if (moves.length === 0) return null;
  const error = move.error;
  const missing =
    error instanceof ApiFailure && error.code === 'workflow.guard.project_setup_complete'
      ? error.details.flatMap((d) => (d.path ? [d.path] : []))
      : [];

  return (
    <div>
      <div>
        {moves.map((m) => (
          <Button
            key={m}
            variant={m === 'activate' ? 'primary' : m === 'cancel' ? 'danger' : 'secondary'}
            loading={move.isPending && move.variables.to === m}
            onClick={() => {
              move.reset();
              if (m === 'activate') move.mutate({ to: m });
              else setAsking(m);
            }}
          >
            {t(`action.${m}`)}
          </Button>
        ))}
      </div>
      {!asking && error instanceof ApiFailure && (
        <Alert tone="error">
          {missing.length > 0 ? t('missing') : error.message}
          {missing.length > 0 && (
            <ul>
              {missing.map((item) => (
                <li key={item}>{missingLabel(item)}</li>
              ))}
            </ul>
          )}
        </Alert>
      )}
      {asking && (
        <ReasonDialog
          title={t(`title.${asking}`)}
          confirm={t(`action.${asking}`)}
          danger={asking === 'cancel' || asking === 'close'}
          date={asking === 'extend' ? { current: project.applyTo } : undefined}
          pending={move.isPending}
          error={move.error}
          onConfirm={(input) => move.mutate({ to: asking, input })}
          onClose={() => {
            setAsking(null);
            move.reset();
          }}
        />
      )}
    </div>
  );
}
