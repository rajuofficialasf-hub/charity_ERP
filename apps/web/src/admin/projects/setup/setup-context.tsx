import { editableIn, type SetupField } from '@css/shared/projects';
import { Alert, Button, Card } from '@/ui';
import { type UseMutationResult } from '@tanstack/react-query';
import {
  createContext,
  Fragment,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useTranslations } from 'use-intl';
import { ApiFailure } from '../../../api/client';
import type { Project } from '../projects-api';

/** What every setup section knows: the project, its version and what may change now. */
export interface SetupState {
  project: Project;
  etag: string;
  /** On a phone only the name, the dates and the switches change. */
  phone: boolean;
  /** The caller configures the project (the PM and the global roles); others only read. */
  configure: boolean;
  /** Reloads the project and every part after a save or a stale version. */
  refresh: () => Promise<unknown>;
}

const SetupContext = createContext<SetupState | null>(null);
export const SetupProvider = SetupContext.Provider;

/** The parts a phone may still change. */
const PHONE_FIELDS: readonly SetupField[] = ['name', 'applyFrom', 'applyTo', 'components'];

export function useSetup() {
  const state = useContext(SetupContext);
  if (!state) throw new Error('useSetup outside the setup page');
  return {
    ...state,
    /** Whether this field or part may change: the project's state, the phone and the caller. */
    editable: (field: SetupField) =>
      state.configure &&
      editableIn(state.project.status, field) &&
      (!state.phone || PHONE_FIELDS.includes(field)),
  };
}

/**
 * Keeps a section's form as the user typed it while other sections save; only a stale save of its
 * own (412) reloads the form from the server, after the new version has arrived, and the notice
 * stays until the next save.
 */
export function Reseed({
  children,
}: {
  children: (state: { stale: boolean; onStale: () => void }) => ReactNode;
}) {
  const { refresh } = useSetup();
  const [state, setState] = useState({ version: 0, stale: false });
  const onStale = () =>
    void refresh().then(() => setState((s) => ({ version: s.version + 1, stale: true })));
  return <Fragment key={state.version}>{children({ stale: state.stale, onStale })}</Fragment>;
}

/** The save of the step on screen: true lets the wizard move on, false keeps the step open. */
type StepSave = () => Promise<boolean>;
const StepSaveContext = createContext<(save: StepSave) => () => void>(() => () => {});
export const StepSaveProvider = StepSaveContext.Provider;

/**
 * Hands this step's save to the wizard, whose Next, step and save-and-exit buttons call it (UX-20).
 * Nothing changed: it moves on. A problem the step can see (a missing name, an order of dates):
 * it stays and says so. Otherwise it saves; a refusal stays, with the server's message shown by
 * `SaveNotice`. Returns the problem to show.
 */
export function useStepSave(step: {
  changed: boolean;
  /** Why the step cannot be saved as it is, in the user's words. */
  invalid?: string;
  save: () => Promise<unknown>;
}) {
  const register = useContext(StepSaveContext);
  const [problem, setProblem] = useState<string>();
  const latest = useRef(step);
  useEffect(() => {
    latest.current = step;
  });
  useEffect(
    () =>
      register(async () => {
        const current = latest.current;
        if (!current.changed) return true;
        if (current.invalid) {
          setProblem(current.invalid);
          return false;
        }
        setProblem(undefined);
        try {
          await current.save();
          return true;
        } catch {
          return false;
        }
      }),
    [register],
  );
  // a problem fixed meanwhile is no longer shown; a different one is shown as it is now
  return problem && step.invalid ? step.invalid : undefined;
}

/**
 * Why a step did not save: a problem the step found, the server's refusal, or the reload after
 * someone else changed the part meanwhile (412).
 */
export function SaveNotice({
  mutation,
  problem,
  stale = false,
}: {
  mutation: Pick<UseMutationResult<unknown, Error, void>, 'error' | 'isPending' | 'isSuccess'>;
  problem?: string;
  stale?: boolean;
}) {
  const t = useTranslations('admin.projects.setup');
  const error = mutation.error;
  if (problem) return <Alert tone="warning">{problem}</Alert>;
  if (error instanceof ApiFailure)
    return (
      <Alert tone={error.status === 412 ? 'warning' : 'error'}>
        {error.status === 412
          ? t('stale')
          : (error.details.map((d) => d.message).find(Boolean) ?? error.message)}
      </Alert>
    );
  if (stale && !mutation.isSuccess && !mutation.isPending)
    return <Alert tone="warning">{t('stale')}</Alert>;
  return null;
}

/** One step of the setup: a card with its heading and its content. */
export function SetupSection({
  id,
  title,
  actions,
  children,
}: {
  id: string;
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-label={title}>
      <Card title={title} headingLevel={2} action={actions}>
        {children}
      </Card>
    </section>
  );
}

/**
 * The button of an action that saves at once (add an area, give access) with its outcome: the
 * server's message for a refusal, a reload notice on 412, and a short confirmation.
 */
export function SaveRow({
  mutation,
  onSave,
  disabled,
  label,
  stale = false,
}: {
  mutation: Pick<UseMutationResult<unknown, Error, void>, 'error' | 'isPending' | 'isSuccess'>;
  onSave: () => void;
  disabled?: boolean;
  label?: string;
  /** The form was reloaded after a stale save (see `Reseed`). */
  stale?: boolean;
}) {
  const t = useTranslations('admin.projects.setup');
  const tc = useTranslations('common.action');
  const error = mutation.error;
  return (
    <div className="admin-setup-save">
      {error instanceof ApiFailure && (
        <Alert tone={error.status === 412 ? 'warning' : 'error'}>
          {error.status === 412
            ? t('stale')
            : (error.details.map((d) => d.message).find(Boolean) ?? error.message)}
        </Alert>
      )}
      {stale && !error && !mutation.isSuccess && !mutation.isPending && (
        <Alert tone="warning">{t('stale')}</Alert>
      )}
      {mutation.isSuccess && !mutation.isPending && <Alert tone="success">{t('saved')}</Alert>}
      <Button onClick={onSave} disabled={disabled} loading={mutation.isPending}>
        {label ?? tc('save')}
      </Button>
    </div>
  );
}
