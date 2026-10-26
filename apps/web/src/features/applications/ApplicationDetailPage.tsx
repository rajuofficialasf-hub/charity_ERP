import { formatDateTime } from '@css/shared/format';
import type { Locale } from '@css/shared/i18n';
import {
  Alert,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  ErrorState,
  Skeleton,
  Stack,
  Text,
} from '@css/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useLocale, useTranslations } from 'use-intl';
import { AccountPage } from '../../components/AccountPage';
import { DocumentTitle } from '../../components/DocumentTitle';
import { ApiFailure } from '../../lib/api';
import { AnswerList } from './AnswerList';
import { ApplicationTimeline } from './ApplicationTimeline';
import {
  actOn,
  application,
  applicationKey,
  MY_APPLICATIONS_KEY,
  timeline,
} from './applications-api';
import { toneOf } from './status';
import { UnlockedAnswer } from './UnlockedAnswer';
import './applications.css';

/**
 * One of the volunteer's applications (docs/ui/SCREENS.md, "My applications and application detail"): the number and the state,
 * the answers without the office's section, the photos, the steps without the office's names,
 * the message the office wrote at a rejection, and what the person may do now: edit or send a
 * draft, delete one not yet reviewed.
 */
export function ApplicationDetailPage() {
  const t = useTranslations('applications.detail');
  return <AccountPage title={() => t('title')}>{() => <Detail />}</AccountPage>;
}

function Detail() {
  const { applicationId = '' } = useParams();
  const t = useTranslations('applications');
  const locale = useLocale() as Locale;
  const queryClient = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const one = useQuery({
    queryKey: applicationKey(applicationId),
    queryFn: () => application(applicationId),
  });
  const steps = useQuery({
    queryKey: [...applicationKey(applicationId), 'timeline'],
    queryFn: () => timeline(applicationId),
  });
  const act = useMutation({
    mutationFn: (action: 'submit' | 'delete') =>
      actOn(applicationId, one.data?.meta.etag ?? '', action),
    onSuccess: async (_, action) => {
      setNotice(action === 'submit' ? t('detail.sent') : t('detail.deleted'));
      await queryClient.invalidateQueries({ queryKey: applicationKey(applicationId) });
      await queryClient.invalidateQueries({ queryKey: MY_APPLICATIONS_KEY });
    },
    onError: async (error) => {
      if (error instanceof ApiFailure && error.status === 412) {
        setNotice(t('detail.stale'));
        await one.refetch();
      } else setNotice(error instanceof ApiFailure ? error.message : t('detail.action_failed'));
    },
  });
  const back = <Link to="/my-applications">{t('detail.back')}</Link>;
  if (one.isPending) return <Skeleton shape="card" />;
  if (one.error || !one.data)
    return (
      <Stack gap={2}>
        {back}
        <ErrorState
          title={t('detail.load_failed')}
          requestId={one.error instanceof ApiFailure ? one.error.requestId : undefined}
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
      {notice ? (
        <Alert tone="info" live="status">
          {notice}
        </Alert>
      ) : null}
      <Card
        title={a.beneficiaryName ?? t('list.unnamed')}
        headingLevel={2}
        actions={
          <Stack direction="row" gap={2} wrap>
            {a.status === 'draft' ? (
              <Button variant="secondary" size="sm" href={`/my-applications/${a.id}/edit`}>
                {t('detail.edit')}
              </Button>
            ) : null}
            {may('submit') ? (
              <Button
                variant="primary"
                size="sm"
                onPress={() => act.mutate('submit')}
                loading={act.isPending}
              >
                {t('detail.submit')}
              </Button>
            ) : null}
            {may('delete') ? (
              <Button variant="danger" size="sm" onPress={() => setConfirmDelete(true)}>
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
            <Badge tone={toneOf(a.status)} label={status} />
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
                  onSent={async () => {
                    setNotice(t('unlock.sent'));
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
      <Card title={t('detail.timeline')} headingLevel={2}>
        {steps.data ? (
          <ApplicationTimeline entries={steps.data} />
        ) : steps.error ? (
          <ErrorState title={t('detail.load_failed')} onRetry={() => void steps.refetch()} />
        ) : (
          <Skeleton shape="text" />
        )}
      </Card>
      <ConfirmDialog
        isOpen={confirmDelete}
        tone="danger"
        title={t('detail.delete_confirm')}
        confirmLabel={t('detail.delete')}
        onConfirm={() => {
          setConfirmDelete(false);
          act.mutate('delete');
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </Stack>
  );
}
