import { type ProjectAction, transitionFor } from '@css/shared/projects';
import { Alert } from '@/ui';
import { useMutation } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';
import { useTranslations } from 'use-intl';
import { ApiFailure } from '../../api/client';
import { cancelProject, type LifecycleAction, moveProject, type Project } from './projects-api';
import { ActivateConfirm } from './ActivateConfirm';
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
function movesFor(status: Project['status'] | undefined): Move[] {
  if (!status) return [];
  const order: Move[] = ['activate', 'extend', 'start_closing', 'close', 'reopen', 'cancel'];
  return order.filter((move) =>
    move === 'extend' ? status === 'active' : transitionFor(move, status) !== null,
  );
}

/**
 * The move a state leads to next, shown as the one main button: a draft is activated, a running
 * session starts closing, a closing one is closed, a closed one may be opened again.
 */
const MAIN: Partial<Record<Project['status'], Move>> = {
  draft: 'activate',
  active: 'start_closing',
  closing: 'close',
  closed: 'reopen',
};

interface LifecycleMoves {
  /** The main move of the state, if the state allows it. */
  main: Move | undefined;
  /** Every other move the state allows, in their order. */
  others: Move[];
  label: (move: Move) => string;
  /** Whether this move is being sent now. */
  pending: (move: Move) => boolean;
  /** Opens the move's confirmation or its reason dialog. */
  start: (move: Move) => void;
  /** The dialogs and the refusal of a move, to render once on the page. */
  ui: ReactNode;
}

/**
 * The lifecycle moves of a project for the PM and the global roles: activate a complete draft,
 * cancel a draft, extend the deadline, start closing, close, reopen. Activation asks to be
 * confirmed, every other move for a reason; the server checks each move again. A refused
 * activation lists what is missing. The page draws the buttons; this gives them their moves.
 */
export function useLifecycleMoves(
  project: Project | undefined,
  etag: string | undefined,
  onMoved: () => void,
): LifecycleMoves {
  const t = useTranslations('admin.projects.lifecycle');
  const missingLabel = useMissingLabel();
  const [asking, setAsking] = useState<Move | null>(null);
  const move = useMutation({
    mutationFn: ({ to, input }: { to: Move; input?: { reason: string; newApplyTo?: string } }) =>
      to === 'cancel'
        ? cancelProject(project!.id, input!.reason)
        : moveProject(project!.id, ROUTE.get(to)!, etag!, input),
    onSuccess: () => {
      setAsking(null);
      onMoved();
    },
  });
  const moves = movesFor(project?.status);
  const wanted = project ? MAIN[project.status] : undefined;
  const main = wanted && moves.includes(wanted) ? wanted : undefined;
  const error = move.error;
  const missing =
    error instanceof ApiFailure && error.code === 'workflow.guard.project_setup_complete'
      ? error.details.flatMap((d) => (d.path ? [d.path] : []))
      : [];

  const ui = project && (
    <>
      <ActivateConfirm
        open={asking === 'activate'}
        pending={move.isPending}
        onConfirm={() => move.mutate({ to: 'activate' }, { onError: () => setAsking(null) })}
        onCancel={() => setAsking(null)}
      />
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
      {asking && asking !== 'activate' && (
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
    </>
  );

  return {
    main,
    others: moves.filter((m) => m !== main),
    label: (m) => t(`action.${m}`),
    pending: (m) => move.isPending && move.variables.to === m,
    start: (m) => {
      move.reset();
      setAsking(m);
    },
    ui,
  };
}
