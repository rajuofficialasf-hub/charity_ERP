import { editableIn, type SetupField } from '@css/shared/projects';
import { Alert, Button, Card } from '@css/ui';
import { type UseMutationResult } from '@tanstack/react-query';
import { createContext, Fragment, type ReactNode, useContext, useState } from 'react';
import { useTranslations } from 'use-intl';
import { ApiFailure } from '../../../lib/api';
import type { Project } from '../projects-api';

/** What every setup section knows: the project, its version and what may change now. */
export interface SetupState {
  project: Project;
  etag: string;
  /** On a phone only the name, the dates and the switches change (SCR-060). */
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

/** One section of the setup: a card with its heading, an anchor for the index, and its content. */
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
    <section id={id} className="admin-setup-section" aria-label={title}>
      <Card title={title} headingLevel={2} actions={actions}>
        {children}
      </Card>
    </section>
  );
}

/**
 * The save button of a section with its outcome: the server's message for a refusal, a reload
 * notice when someone else changed the part meanwhile (412), and a short confirmation.
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
        <Alert tone={error.status === 412 ? 'warning' : 'danger'} live="alert">
          {error.status === 412
            ? t('stale')
            : (error.details.map((d) => d.message).find(Boolean) ?? error.message)}
        </Alert>
      )}
      {stale && !error && !mutation.isSuccess && !mutation.isPending && (
        <Alert tone="warning" live="alert">
          {t('stale')}
        </Alert>
      )}
      {mutation.isSuccess && !mutation.isPending && (
        <Alert tone="success" live="status">
          {t('saved')}
        </Alert>
      )}
      <Button onPress={onSave} disabled={disabled} loading={mutation.isPending}>
        {label ?? tc('save')}
      </Button>
    </div>
  );
}
