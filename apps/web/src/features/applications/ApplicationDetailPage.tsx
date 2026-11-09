import { formatDateTime } from '@css/shared/format';
import type { Locale } from '@css/shared/i18n';
import { Alert, Button, Card, Chip, ConfirmDialog, LinkButton, Skeleton, Stack, Text } from '@/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useLocale, useTranslations } from 'use-intl';
import { AccountPage } from '../../components/AccountPage';
import { DocumentTitle } from '../../components/DocumentTitle';
import { LoadError } from '../../components/LoadError';
import { ApiFailure } from '../../lib/api';
import { AnswerList } from './AnswerList';
import { ApplicationTimeline } from './ApplicationTimeline';
import { actOn, applicationKey, MY_APPLICATIONS_KEY, timeline } from './applications-api';
import { stateTone } from './status';
import { SyncBadge } from './SyncBadge';
import { UnlockedAnswer } from './UnlockedAnswer';
import { loadStore, recordOf, storeMessage } from './use-local-records';
import './applications.css';

/**
 * One of the volunteer's applications (docs/ui/SCREENS.md, "My applications and application detail"): the number and the state,
 * the answers without the office's section, the photos, the steps without the office's names,
 * the message the office wrote at a rejection, and what the person may do now: edit or send a
 * draft, delete one not yet reviewed. The record comes from the server while there is network
 * and from the phone otherwise; a send or a correction goes through the outbox either way.
 */
export function ApplicationDetailPage() {
  const t = useTranslations('applications.detail');
  return <AccountPage title={() => t('title')}>{() => <Detail />}</AccountPage>;
}

function Detail() {
  const { applicationId = '' } = useParams();
  const t = useTranslations('applications');
  const te = useTranslations('errors');
  const locale = useLocale() as Locale;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const one = useQuery({
    queryKey: applicationKey(applicationId),
    queryFn: () => recordOf(applicationId),
  });
  const steps = useQuery({
    queryKey: [...applicationKey(applicationId), 'timeline'],
    queryFn: () => timeline(applicationId),
    enabled: one.data?.data.local !== true,
  });
  const reasonOf = (code: string | null) =>
    code && te.has(code as never) ? te(code as never) : t('detail.action_failed');
  const tSync = (key: 'store_unavailable' | 'record_on_its_way') => t(`sync.${key}`);
  const wordsOf = (error: unknown) =>
    storeMessage(error, tSync) ??
    (error instanceof Error ? error.message : t('detail.action_failed'));
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: applicationKey(applicationId) });
    await queryClient.invalidateQueries({ queryKey: MY_APPLICATIONS_KEY });
  };
  /** The send goes through the outbox; with network the answer comes back at once. */
  const submit = useMutation({
    mutationFn: async () => {
      const a = one.data!.data;
      const store = await loadStore();
      const id = await store.sendToOffice({
        projectId: a.projectId,
        formVersionId: a.formVersionId,
        draftClientUuid: a.local ? a.id : null,
        serverId: a.local ? null : a.id,
      });
      if (!navigator.onLine) return 'queued' as const;
      const state = await store.settle(id);
      if (state?.state === 'failed') throw new Error(reasonOf(state.failureCode));
      return state?.state === 'synced' ? ('sent' as const) : ('queued' as const);
    },
    onSuccess: async (outcome) => {
      setNotice(outcome === 'sent' ? t('detail.sent') : t('sync.saved_on_phone'));
      await refresh();
    },
    onError: (error) => setNotice(wordsOf(error)),
  });
  /** A draft of the phone's own is dropped there; the server's goes through its action. */
  const remove = useMutation({
    mutationFn: async () => {
      const a = one.data!.data;
      if (a.local) {
        const store = await loadStore();
        await store.removeLocal(a.id);
        return;
      }
      await actOn(applicationId, one.data?.meta.etag ?? '', 'delete');
    },
    onSuccess: async () => {
      setNotice(t('detail.deleted'));
      if (one.data?.data.local) {
        // the phone's draft is gone with its address: back to the drafts
        void navigate('/my-applications?tab=draft', { replace: true });
        await queryClient.invalidateQueries({ queryKey: MY_APPLICATIONS_KEY });
        return;
      }
      await refresh();
    },
    onError: async (error) => {
      if (error instanceof ApiFailure && error.status === 412) {
        setNotice(t('detail.stale'));
        await one.refetch();
      } else setNotice(wordsOf(error));
    },
  });
  const back = <Link to="/my-applications">{t('detail.back')}</Link>;
  if (one.isPending) return <Skeleton shape="card" />;
  if (one.error || !one.data)
    return (
      <Stack gap={2}>
        {back}
        <LoadError
          title={t('detail.load_failed')}
          error={one.error}
          onRetry={() => void one.refetch()}
        />
      </Stack>
    );
  const a = one.data.data;
  const status = t.has(`status.${a.status}` as never) ? t(`status.${a.status}` as never) : a.status;
  const may = (action: string) => a.availableActions.includes(action);
  return (
    <Stack gap={3}>
      <DocumentTitle title={a.appNo ?? t('detail.title')} />
      {back}
      {notice ? <Alert tone="info">{notice}</Alert> : null}
      <Card
        title={a.beneficiaryName ?? t('list.unnamed')}
        headingLevel={2}
        action={
          <Stack direction="row" gap={2} wrap>
            {a.status === 'draft' ? (
              <LinkButton variant="secondary" to={`/my-applications/${a.id}/edit`}>
                {t('detail.edit')}
              </LinkButton>
            ) : null}
            {may('submit') && a.sync?.state !== 'pending' && a.sync?.state !== 'syncing' ? (
              <Button
                variant="primary"
                size="small"
                onClick={() => submit.mutate()}
                loading={submit.isPending}
              >
                {t('detail.submit')}
              </Button>
            ) : null}
            {may('delete') || a.local ? (
              <Button variant="danger" size="small" onClick={() => setConfirmDelete(true)}>
                {t('detail.delete')}
              </Button>
            ) : null}
          </Stack>
        }
      >
        <dl className="my-application-facts">
          <dt>{t('detail.number')}</dt>
          <dd>{a.appNo ?? t('list.no_number')}</dd>
          <dt>{t('detail.status')}</dt>
          <dd>
            <Stack direction="row" gap={1} wrap>
              <Chip tone={stateTone(a.status)}>{status}</Chip>
              <SyncBadge sync={a.sync} />
            </Stack>
          </dd>
          {a.submittedAt ? (
            <>
              <dt>{t('detail.submitted_at')}</dt>
              <dd>{formatDateTime(a.submittedAt, locale)}</dd>
            </>
          ) : null}
        </dl>
      </Card>
      {a.rejectionMessage ? (
        <Card title={t('detail.message')} headingLevel={2}>
          <Text>{a.rejectionMessage}</Text>
        </Card>
      ) : null}
      {a.unlocks?.length ? (
        <Card title={t('unlock.volunteer_title')} headingLevel={2}>
          <Stack gap={3}>
            <Text tone="muted">{t('unlock.volunteer_help')}</Text>
            {a.unlocks.map((unlock) => {
              const field = a.form.sections
                .flatMap((s) => s.fields)
                .find((f) => f.fieldKey === unlock.fieldKey);
              return field ? (
                <UnlockedAnswer
                  key={unlock.id}
                  unlock={unlock}
                  field={field}
                  fill={async (value) => {
                    const store = await loadStore();
                    const id = await store.fillUnlock({
                      projectId: a.projectId,
                      formVersionId: a.formVersionId,
                      unlockId: unlock.id,
                      value,
                    });
                    if (!navigator.onLine) return 'queued';
                    const state = await store.settle(id);
                    if (state?.state === 'failed') throw new Error(reasonOf(state.failureCode));
                    return state?.state === 'synced' ? 'sent' : 'queued';
                  }}
                  onSent={async () => {
                    setNotice(navigator.onLine ? t('unlock.sent') : t('sync.saved_on_phone'));
                    await queryClient.invalidateQueries({
                      queryKey: applicationKey(applicationId),
                    });
                  }}
                />
              ) : null;
            })}
          </Stack>
        </Card>
      ) : null}
      <Card title={t('detail.answers')} headingLevel={2}>
        <AnswerList form={a.form} answers={a.answers} />
      </Card>
      {a.local ? null : (
        <Card title={t('detail.timeline')} headingLevel={2}>
          {steps.data ? (
            <ApplicationTimeline entries={steps.data} />
          ) : steps.error ? (
            <LoadError
              title={t('detail.load_failed')}
              error={steps.error}
              onRetry={() => void steps.refetch()}
            />
          ) : (
            <Skeleton shape="text" />
          )}
        </Card>
      )}
      <ConfirmDialog
        open={confirmDelete}
        tone="danger"
        title={t('detail.delete_confirm')}
        confirmLabel={t('detail.delete')}
        onConfirm={() => {
          setConfirmDelete(false);
          remove.mutate();
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </Stack>
  );
}
