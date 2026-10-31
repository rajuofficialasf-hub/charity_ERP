import { formatCount, formatDateTime, formatFileSize } from '@css/shared/format';
import type { Locale } from '@css/shared/i18n';
import { Alert, Button, ConfirmDialog, EmptyState, Skeleton } from '@css/ui';
import { CircleCheck, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { useLocale, useTranslations } from 'use-intl';
import { AccountPage } from '../../components/AccountPage';
import { DocumentTitle } from '../../components/DocumentTitle';
import { deviceInfo } from '../../lib/api';
import type { OverviewRecord } from '../../offline/applications-store';
import { useOffline } from '../../offline/OfflineProvider';
import { storeMessage } from '../applications/use-local-records';
import { PhotoSection } from './PhotoSection';
import { RecordRow } from './RecordRow';
import { SyncReminder } from './SyncReminder';
import './sync.css';
import { useOverview } from './use-sync-store';

type Group = 'failed' | 'waiting' | 'verifying' | 'photos';

/** The one group a record is shown under: a refusal first, then the way, then the office's part. */
function groupOf(record: OverviewRecord): Group | null {
  const { sync } = record;
  if (sync.state === 'failed') return 'failed';
  if (sync.state === 'pending' || sync.state === 'syncing') return 'waiting';
  if (sync.verificationReason) return 'verifying';
  if (sync.photosPending) return 'photos';
  return null;
}

const GROUPS: Group[] = ['failed', 'waiting', 'verifying', 'photos'];

/**
 * The sync centre at `/sync` (docs/ui/SCREENS.md, SCR-005): what waits on this phone, what the
 * office refused and why, the photos and their room, the last sync, and the actions on each
 * record; an empty state when everything has gone.
 */
export function SyncCentrePage() {
  const t = useTranslations('sync.centre');
  return (
    <AccountPage title={() => t('title')}>
      {() => (
        <>
          <DocumentTitle title={t('title')} />
          <Centre />
        </>
      )}
    </AccountPage>
  );
}

function Centre() {
  const t = useTranslations('sync.centre');
  const te = useTranslations('errors');
  const ta = useTranslations('applications.sync');
  const tq = useTranslations('sync');
  const tAuth = useTranslations('auth.offline');
  const locale = useLocale() as Locale;
  const { status, online, syncNow } = useOffline();
  const { overview, store, loading, refresh } = useOverview();
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [target, setTarget] = useState<OverviewRecord | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const reasonOf = (code: string | null) =>
    code && te.has(code as never) ? te(code as never) : t('reason_unknown');
  const tSync = (key: 'store_unavailable' | 'record_on_its_way') => ta(key);
  const failWith = (error: unknown) =>
    setNotice({
      tone: 'danger',
      text:
        storeMessage(error, tSync) ??
        (error instanceof Error ? error.message : t('reason_unknown')),
    });
  const run = async (key: string, work: () => Promise<void>, done?: string) => {
    setBusy(key);
    setNotice(null);
    try {
      await work();
      await refresh();
      if (done) setNotice({ tone: 'success', text: done });
    } catch (error) {
      failWith(error);
    } finally {
      setBusy(null);
    }
  };

  const records = overview?.records ?? [];
  const grouped = GROUPS.map((group) => ({
    group,
    records: records.filter((r) => groupOf(r) === group),
  })).filter((g) => g.records.length > 0);
  const photos = overview?.photos;
  const anyPhotos = (photos?.waitingCount ?? 0) + (photos?.uploadedCount ?? 0) > 0;
  const empty = !loading && records.length === 0 && !anyPhotos;

  return (
    <div className="sync-centre">
      <div className="sync-status">
        <p>
          {status.lastSyncAt
            ? t('last_sync', { time: formatDateTime(status.lastSyncAt, locale) })
            : t('never_synced')}
        </p>
        <Button
          variant="secondary"
          icon={RefreshCw}
          loading={busy === 'sync' || status.state === 'syncing'}
          onPress={() => void run('sync', syncNow)}
        >
          {status.state === 'syncing' ? t('syncing') : t('sync_now')}
        </Button>
      </div>
      {!online && <Alert tone="info">{t('offline')}</Alert>}
      {status.state === 'signed_out' && <Alert tone="warning">{t('signed_out')}</Alert>}
      {notice && (
        <Alert tone={notice.tone} live="status" onDismiss={() => setNotice(null)}>
          {notice.text}
        </Alert>
      )}
      <SyncReminder />
      {deviceInfo().platform === 'ios' && <Alert tone="info">{tAuth('ios_storage')}</Alert>}
      {loading && <Skeleton shape="card" />}
      {empty && (
        <EmptyState
          icon={CircleCheck}
          title={t('empty')}
          message={t('empty_hint')}
          headingLevel={2}
        />
      )}
      {grouped.map(({ group, records: rows }) => (
        <section key={group} className="sync-group" aria-labelledby={`sync-group-${group}`}>
          <div className="sync-group-head">
            <h2 id={`sync-group-${group}`}>
              {t(`group.${group}`)} ({formatCount(rows.length, locale)})
            </h2>
            {group === 'failed' && rows.length > 1 && store && (
              <Button
                variant="secondary"
                size="sm"
                loading={busy === 'all'}
                onPress={() => void run('all', () => store.retryAll(), t('sent'))}
              >
                {t('retry_all')}
              </Button>
            )}
          </div>
          <ul className="sync-list">
            {rows.map((record) => (
              <RecordRow
                key={record.clientUuid}
                record={record}
                reason={group === 'failed' ? reasonOf(record.sync.failureCode) : null}
                note={group === 'verifying' ? t('verifying_note') : null}
                busy={busy === record.clientUuid}
                onRetry={
                  store && (group === 'failed' || group === 'waiting')
                    ? () => void run(record.clientUuid, () => store.retryRecord(record.clientUuid))
                    : undefined
                }
                onDelete={record.ownDraft ? () => setTarget(record) : undefined}
              />
            ))}
          </ul>
        </section>
      ))}
      {photos && anyPhotos && store && (
        <PhotoSection
          photos={photos}
          busy={busy === 'free'}
          onFree={() =>
            void run('free', async () => {
              const freed = await store.freePhotoSpace();
              setNotice({
                tone: 'success',
                text: t('freed', { size: formatFileSize(freed, locale) }),
              });
            })
          }
          freeLabel={tq('photo.free_space')}
        />
      )}
      <ConfirmDialog
        isOpen={target !== null}
        title={t('delete_title')}
        message={t('delete_body', { name: target?.beneficiaryName ?? t('unnamed') })}
        tone="danger"
        confirmLabel={t('delete_confirm')}
        pending={busy === 'delete'}
        onConfirm={() => {
          const record = target;
          if (!record || !store) return;
          void run('delete', () => store.removeLocal(record.clientUuid), t('deleted')).finally(() =>
            setTarget(null),
          );
        }}
        onCancel={() => setTarget(null)}
      />
    </div>
  );
}
