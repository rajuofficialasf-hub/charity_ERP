import { formatDateTime, isoDateInDhaka } from '@css/shared/format';
import type { Locale } from '@css/shared/i18n';
import {
  Alert,
  Button,
  Card,
  Chip,
  ConfirmDialog,
  DescriptionList,
  Page,
  Skeleton,
  Stack,
  Timeline,
  type TimelineStep,
} from '@/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { unlockRefusal, type FormField } from '@css/shared/forms';
import { useLocale, useTranslations } from 'use-intl';
import { DocumentTitle } from '../../components/DocumentTitle';
import { AnswerList } from '../../features/applications/AnswerList';
import { stateLabel as labelOf } from '../../features/applications/status';
import { stateTone } from '../../features/applications/status';
import { FormRenderer, type Submission } from '../../features/forms/FormRenderer';
import { ApiFailure } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { ForbiddenContent } from '../AdminLayout';
import { canSeeApplications } from '../roles';
import {
  applicationKey,
  APPLICATIONS_KEY,
  askedComments,
  changeLog,
  type CommentReason,
  type OfficeAction,
  officeAct,
  officeApplication,
  officeTimeline,
  openUnlock,
  saveAnswers,
} from './applications-api';
import { ChangeLog } from './ChangeLog';
import { MediaBadge } from './MediaBadge';
import { ReferralDialog } from './ReferralDialog';
import { DecisionDialog, type DecisionTexts } from './DecisionDialog';
import { UnlockReview } from './UnlockReview';
import { VerifyDialog } from './VerifyDialog';
import { ScoreBreakdown } from './ScoreBreakdown';
import { Signals } from './Signals';
import './applications.css';
import { RecordPdfButton } from '../../features/exports/RecordPdfButton';
import { LoadError } from '../../components/LoadError';

/** The actions an official takes from the record, in the order of the cycle. */
const ACTIONS: OfficeAction[] = [
  'review',
  'send_for_approval',
  'approve',
  'pull_from_waitlist',
  'waitlist',
  'reject',
  'return_to_review',
  'reject_unverified',
  'delete',
];
/** The verifications: one button, whose dialog chooses the link or the new profile by a lookup. */
const VERIFY: OfficeAction[] = ['verify_link', 'verify_create'];
/** The actions that ask for the office's reason, and the one that asks for the volunteer's message too. */
const WITH_REASON: OfficeAction[] = ['reject', 'return_to_review', 'reject_unverified', 'waitlist'];
/** The decisions that end an application's hopes in this project, drawn in the danger tone. */
const DANGER: OfficeAction[] = ['reject', 'reject_unverified', 'delete'];
/** The action awaiting its texts, with the comments it asks for. */
interface Asking {
  action: OfficeAction;
  reasons: CommentReason[];
}

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
  const { me } = useAuth();
  const t = useTranslations('applications.office');
  const tu = useTranslations('applications.unlock');
  const tm = useTranslations('media');
  const [opening, setOpening] = useState<FormField | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [referring, setReferring] = useState(false);
  const ts = useTranslations('applications.status');
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [asking, setAsking] = useState<Asking | null>(null);
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
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
    mutationFn: (input: { action: OfficeAction } & DecisionTexts) =>
      officeAct(applicationId, one.data?.meta.etag ?? '', input.action, {
        reason: input.reason,
        message: input.message,
        comment: input.comment,
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
    onError: async (error, input) => {
      // a changed version is read again, so the next try carries the version the record has now
      if (error instanceof ApiFailure && error.status === 412) await one.refetch();
      // the server asked for a comment the screen did not know of (another decision came first):
      // the dialog opens with the reasons it named
      const reasons = askedComments(error);
      if (reasons?.length) {
        act.reset();
        setAsking({ action: input.action, reasons });
        return;
      }
      // the decision dialog shows its own failure and keeps the texts typed
      if (asking && asking.action !== 'delete') return;
      setAsking(null);
      setNotice({ tone: 'error', text: failureText(error) });
    },
  });
  const open = useMutation({
    mutationFn: ({ field, reason }: { field: FormField; reason: string }) =>
      openUnlock(applicationId, field.fieldKey, reason),
    onSuccess: async () => {
      setOpening(null);
      setNotice({ tone: 'success', text: tu('opened') });
      await refresh();
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
        <LoadError error={one.error} onRetry={() => void one.refetch()} />
      </Stack>
    );
  const a = one.data.data;
  const etag = one.data.meta.etag ?? '';
  const may = (action: OfficeAction) => a.availableActions.includes(action);
  // the entry is checked against the profiles now, so a profile made after the entry still links
  const verifiable = VERIFY.some(may);
  const hinted = (action: OfficeAction) => a.decisionHints[action] ?? [];
  const start = (action: OfficeAction) =>
    WITH_REASON.includes(action) || action === 'delete' || hinted(action).length
      ? setAsking({ action, reasons: hinted(action) })
      : act.mutate({ action });
  const stateLabel = (status: string) => labelOf(ts, status);
  const timeline: TimelineStep[] = (steps.data ?? []).map((e, i, all) => ({
    id: e.id,
    title: stateLabel(e.to),
    actor: e.actor?.name,
    time: formatDateTime(e.at, locale),
    comment: [e.reason, e.comment, e.message].filter(Boolean).join(' · ') || undefined,
    status: e.to === 'rejected' ? 'rejected' : i === all.length - 1 ? 'current' : 'done',
  }));
  // an answer that can open, and has no unlock waiting, offers it on an approved record
  const waiting = new Set((a.unlocks ?? []).map((u) => u.fieldKey));
  const unlockAction = a.mayUnlock
    ? (field: FormField) =>
        unlockRefusal(field) === null && !waiting.has(field.fieldKey) ? (
          <Button
            variant="text"
            size="small"
            startIcon="unlock"
            ariaLabel={`${tu('open')}: ${field.label[locale]}`}
            onClick={() => setOpening(field)}
          >
            {tu('open')}
          </Button>
        ) : null
    : undefined;
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
        <Alert tone={notice.tone} onDismiss={() => setNotice(null)}>
          {notice.text}
        </Alert>
      ) : null}
      <Page title={a.beneficiaryName ?? t('unnamed')} documentTitle={false} />
      <Card
        title={a.appNo ?? t('no_number')}
        headingLevel={2}
        action={
          <Stack direction="row" gap={2} wrap>
            <RecordPdfButton kind="application" id={a.id} />
            {verifiable ? (
              <Button variant="primary" size="small" onClick={() => setVerifying(true)}>
                {t('action.verify')}
              </Button>
            ) : null}
            {ACTIONS.filter(may).map((action) => (
              <Button
                key={action}
                variant={
                  action === 'approve' || action === 'pull_from_waitlist'
                    ? 'primary'
                    : DANGER.includes(action)
                      ? 'danger'
                      : 'secondary'
                }
                size="small"
                loading={act.isPending && !asking}
                onClick={() => start(action)}
              >
                {t(`action.${action}`)}
              </Button>
            ))}
            {a.mayReferToMedia ? (
              <Button variant="secondary" size="small" onClick={() => setReferring(true)}>
                {a.media ? tm('referral.resend') : tm('referral.action')}
              </Button>
            ) : null}
            {a.status === 'under_review' && !editing ? (
              <Button variant="text" size="small" onClick={() => setEditing(true)}>
                {t('edit_answers')}
              </Button>
            ) : null}
          </Stack>
        }
      >
        <DescriptionList
          items={[
            {
              label: t('column.status'),
              value: (
                <Stack direction="row" gap={2} wrap>
                  <Chip tone={stateTone(a.status)}>{stateLabel(a.status)}</Chip>
                  {a.media ? <MediaBadge media={a.media} /> : null}
                </Stack>
              ),
            },
            ...(a.media?.state === 'sent_back' || a.media?.state === 'rejected'
              ? [
                  {
                    label: tm('title'),
                    value: tm('referral.returned', { comment: a.media.decisionComment ?? '' }),
                  },
                ]
              : []),
            ...(a.submittedAt
              ? [{ label: t('column.submitted'), value: formatDateTime(a.submittedAt, locale) }]
              : []),
            ...(a.clientCreatedAt
              ? [
                  {
                    label: t('column.device_time'),
                    value: formatDateTime(a.clientCreatedAt, locale),
                  },
                ]
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
      {a.unlocks?.length ? (
        <UnlockReview
          form={a.form}
          unlocks={a.unlocks}
          meId={me?.id ?? ''}
          onChanged={async (text) => {
            setNotice({ tone: 'success', text });
            await refresh();
          }}
        />
      ) : null}
      {typeof a.totalScore === 'number' && a.scoreItems ? (
        <ScoreBreakdown total={a.totalScore} items={a.scoreItems} />
      ) : null}
      <Card title={t('answers')} headingLevel={2}>
        {editing && a.status === 'under_review' ? (
          <FormRenderer
            definition={a.form}
            audience="official"
            today={isoDateInDhaka(new Date())}
            initialAnswers={a.answers}
            fillDefaults={false}
            layout="page"
            submitLabel={tc('action.save')}
            onSubmit={save}
          />
        ) : (
          <AnswerList form={a.form} answers={a.answers} action={unlockAction} />
        )}
      </Card>
      <Card title={t('timeline')} headingLevel={2}>
        {steps.data ? (
          <Timeline steps={timeline} showActor label={t('timeline')} />
        ) : steps.error ? (
          <LoadError error={steps.error} onRetry={() => void steps.refetch()} />
        ) : (
          <Skeleton shape="text" />
        )}
      </Card>
      <Card title={t('changes.title')} headingLevel={2}>
        {changes.data ? (
          <ChangeLog changes={changes.data} form={a.form} />
        ) : changes.error ? (
          <LoadError error={changes.error} onRetry={() => void changes.refetch()} />
        ) : (
          <Skeleton shape="text" />
        )}
      </Card>
      {asking && asking.action !== 'delete' ? (
        <DecisionDialog
          title={t(`dialog.${asking.action as 'reject'}`)}
          confirm={t(`action.${asking.action}`)}
          withReason={WITH_REASON.includes(asking.action)}
          withMessage={asking.action === 'reject'}
          comments={asking.reasons}
          danger={DANGER.includes(asking.action)}
          pending={act.isPending}
          error={act.error ? failureText(act.error) : null}
          onConfirm={(input) => act.mutate({ action: asking.action, ...input })}
          onClose={() => {
            act.reset();
            setAsking(null);
          }}
        />
      ) : null}
      {referring ? (
        <ReferralDialog
          applicationId={applicationId}
          resend={Boolean(a.media)}
          onClose={() => setReferring(false)}
          onDone={async () => {
            setReferring(false);
            setNotice({ tone: 'success', text: tm('referral.sent') });
            await refresh();
          }}
        />
      ) : null}
      {verifying ? (
        <VerifyDialog
          application={a}
          etag={etag}
          onClose={() => setVerifying(false)}
          onDone={async (done) => {
            setNotice({ tone: 'success', text: t(`done.${done}`) });
            setVerifying(false);
            await refresh();
          }}
        />
      ) : null}
      {opening ? (
        <DecisionDialog
          title={tu('open_title', { name: opening.label[locale] })}
          confirm={tu('open_confirm')}
          pending={open.isPending}
          error={open.error ? failureText(open.error) : null}
          onConfirm={({ reason }) => open.mutate({ field: opening, reason: reason ?? '' })}
          onClose={() => {
            open.reset();
            setOpening(null);
          }}
        />
      ) : null}
      <ConfirmDialog
        open={asking?.action === 'delete'}
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
