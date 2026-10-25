import { formatDateTime, isoDateInDhaka } from '@css/shared/format';
import type { Locale } from '@css/shared/i18n';
import {
  Alert,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  DescriptionList,
  ErrorState,
  Skeleton,
  Stack,
  Timeline,
  type TimelineStep,
} from '@css/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useLocale, useTranslations } from 'use-intl';
import { DocumentTitle } from '../../components/DocumentTitle';
import { AnswerList } from '../../features/applications/AnswerList';
import { stateLabel as labelOf, toneOf } from '../../features/applications/status';
import { FormRenderer, type Submission } from '../../features/forms/FormRenderer';
import { ApiFailure } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { ForbiddenContent } from '../AdminLayout';
import { canSeeApplications } from '../roles';
import {
  applicationKey,
  APPLICATIONS_KEY,
  changeLog,
  type OfficeAction,
  officeAct,
  officeApplication,
  officeTimeline,
  saveAnswers,
} from './applications-api';
import { ChangeLog } from './ChangeLog';
import { DecisionDialog } from './DecisionDialog';
import { Signals } from './Signals';
import './applications.css';

/** The actions an official takes from the record, in the order of the cycle. */
const ACTIONS: OfficeAction[] = [
  'review',
  'send_for_approval',
  'approve',
  'reject',
  'return_to_review',
  'reject_unverified',
  'delete',
];
/** The actions that ask for the office's reason, and the one that asks for the volunteer's message too. */
const WITH_REASON: OfficeAction[] = ['reject', 'return_to_review', 'reject_unverified'];

/**
 * One application for the office (docs/ui/SCREENS.md, "Application review list and detail"): the
 * signals, the answers with the official section (editable while the review runs), the steps
 * with who took each and why, the change log, and the moves the official may make now.
 */
export function ApplicationReviewPage() {
  const { me } = useAuth();
  if (!me) return null;
  if (!canSeeApplications(me)) return <ForbiddenContent />;
  return <Review />;
}

function Review() {
  const { applicationId = '' } = useParams();
  const t = useTranslations('applications.office');
  const ts = useTranslations('applications.status');
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [asking, setAsking] = useState<OfficeAction | null>(null);
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const one = useQuery({
    queryKey: applicationKey(applicationId),
    queryFn: () => officeApplication(applicationId),
  });
  const steps = useQuery({
    queryKey: [...applicationKey(applicationId), 'timeline'],
    queryFn: () => officeTimeline(applicationId),
  });
  const changes = useQuery({
    queryKey: [...applicationKey(applicationId), 'changes'],
    queryFn: () => changeLog(applicationId),
  });
  // the record's key starts with the list's, so one invalidation reads both again
  const refresh = () => queryClient.invalidateQueries({ queryKey: APPLICATIONS_KEY });
  const act = useMutation({
    mutationFn: (input: { action: OfficeAction; reason?: string; message?: string }) =>
      officeAct(applicationId, one.data?.meta.etag ?? '', input.action, {
        reason: input.reason,
        message: input.message,
      }),
    onSuccess: async (result, input) => {
      setAsking(null);
      setEditing(false);
      await refresh();
      // a deleted application has no page any more; the list is where the official continues
      if (input.action === 'delete') {
        void navigate(`/admin/projects/${result.data.projectId}/applications`);
        return;
      }
      setNotice({ tone: 'success', text: t(`done.${input.action}`) });
    },
    onError: async (error) => {
      // a changed version is read again, so the next try carries the version the record has now
      if (error instanceof ApiFailure && error.status === 412) await one.refetch();
      // the decision dialog shows its own failure and keeps the texts typed
      if (asking && asking !== 'delete') return;
      setAsking(null);
      setNotice({ tone: 'danger', text: failureText(error) });
    },
  });
  const failureText = (error: unknown) =>
    error instanceof ApiFailure && error.status === 412
      ? t('stale')
      : error instanceof ApiFailure
        ? error.message
        : tc('state.error.text');
  const back = (
    <Link
      to={one.data ? `/admin/projects/${one.data.data.projectId}/applications` : '/admin/projects'}
    >
      {t('back_list')}
    </Link>
  );
  if (one.isPending) return <Skeleton shape="card" />;
  if (one.error || !one.data)
    return (
      <Stack gap={2}>
        {back}
        <ErrorState
          title={tc('state.error.text')}
          requestId={one.error instanceof ApiFailure ? one.error.requestId : undefined}
          onRetry={() => void one.refetch()}
        />
      </Stack>
    );
  const a = one.data.data;
  const etag = one.data.meta.etag ?? '';
  const may = (action: OfficeAction) => a.availableActions.includes(action);
  const stateLabel = (status: string) => labelOf(ts, status);
  const timeline: TimelineStep[] = (steps.data ?? []).map((e, i, all) => ({
    id: e.id,
    title: stateLabel(e.to),
    actor: e.actor?.name,
    time: formatDateTime(e.at, locale),
    comment: [e.reason, e.comment, e.message].filter(Boolean).join(' · ') || undefined,
    status: e.to === 'rejected' ? 'rejected' : i === all.length - 1 ? 'current' : 'done',
  }));
  const save = async ({ answers }: Submission) => {
    try {
      await saveAnswers(applicationId, etag, answers);
      setEditing(false);
      setNotice({ tone: 'success', text: t('done.saved') });
      await refresh();
    } catch (error) {
      throw new Error(failureText(error), { cause: error });
    }
  };
  return (
    <Stack gap={3}>
      <DocumentTitle title={a.appNo ?? t('title')} />
      {back}
      {notice ? (
        <Alert tone={notice.tone} live="status" onDismiss={() => setNotice(null)}>
          {notice.text}
        </Alert>
      ) : null}
      <h1 className="admin-title">{a.beneficiaryName ?? t('unnamed')}</h1>
      <Card
        title={a.appNo ?? t('no_number')}
        headingLevel={2}
        actions={
          <Stack direction="row" gap={2} wrap>
            {ACTIONS.filter(may).map((action) => (
              <Button
                key={action}
                variant={
                  action === 'approve'
                    ? 'primary'
                    : action === 'reject' || action === 'reject_unverified' || action === 'delete'
                      ? 'danger'
                      : 'secondary'
                }
                size="sm"
                loading={act.isPending && !asking}
                onPress={() =>
                  WITH_REASON.includes(action) || action === 'delete'
                    ? setAsking(action)
                    : act.mutate({ action })
                }
              >
                {t(`action.${action}`)}
              </Button>
            ))}
            {a.status === 'under_review' && !editing ? (
              <Button variant="ghost" size="sm" onPress={() => setEditing(true)}>
                {t('edit_answers')}
              </Button>
            ) : null}
          </Stack>
        }
      >
        <DescriptionList
          labelWidth="sm"
          items={[
            {
              label: t('column.status'),
              value: <Badge tone={toneOf(a.status)} label={stateLabel(a.status)} />,
            },
            ...(a.submittedAt
              ? [{ label: t('column.submitted'), value: formatDateTime(a.submittedAt, locale) }]
              : []),
            ...(a.decisionComment
              ? [{ label: t('decision.reason'), value: a.decisionComment }]
              : []),
            ...(a.rejectionMessage
              ? [{ label: t('decision.message'), value: a.rejectionMessage }]
              : []),
          ]}
        />
      </Card>
      <Signals application={a} />
      <Card title={t('answers')} headingLevel={2}>
        {editing && a.status === 'under_review' ? (
          <FormRenderer
            definition={a.form}
            audience="official"
            today={isoDateInDhaka(new Date())}
            initialAnswers={a.answers}
            layout="page"
            submitLabel={tc('action.save')}
            onSubmit={save}
          />
        ) : (
          <AnswerList form={a.form} answers={a.answers} />
        )}
      </Card>
      <Card title={t('timeline')} headingLevel={2}>
        {steps.data ? (
          <Timeline steps={timeline} showActor label={t('timeline')} />
        ) : steps.error ? (
          <ErrorState title={tc('state.error.text')} onRetry={() => void steps.refetch()} />
        ) : (
          <Skeleton shape="text" />
        )}
      </Card>
      <Card title={t('changes.title')} headingLevel={2}>
        {changes.data ? (
          <ChangeLog changes={changes.data} form={a.form} />
        ) : changes.error ? (
          <ErrorState title={tc('state.error.text')} onRetry={() => void changes.refetch()} />
        ) : (
          <Skeleton shape="text" />
        )}
      </Card>
      {asking && asking !== 'delete' ? (
        <DecisionDialog
          title={t(`dialog.${asking as 'reject'}`)}
          confirm={t(`action.${asking}`)}
          withMessage={asking === 'reject'}
          danger={asking !== 'return_to_review'}
          pending={act.isPending}
          error={act.error ? failureText(act.error) : null}
          onConfirm={(input) => act.mutate({ action: asking, ...input })}
          onClose={() => {
            act.reset();
            setAsking(null);
          }}
        />
      ) : null}
      <ConfirmDialog
        isOpen={asking === 'delete'}
        tone="danger"
        title={t('dialog.delete')}
        confirmLabel={t('action.delete')}
        pending={act.isPending}
        onConfirm={() => act.mutate({ action: 'delete' })}
        onCancel={() => setAsking(null)}
      />
    </Stack>
  );
}
