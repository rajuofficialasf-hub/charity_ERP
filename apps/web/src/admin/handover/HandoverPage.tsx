import { formatDateTime } from '@css/shared/format';
import type { Locale } from '@css/shared/i18n';
import { Alert, Badge, Button, ConfirmDialog, ErrorState, Skeleton } from '@css/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRightLeft, CheckCheck, UserX } from 'lucide-react';
import { useId, useState } from 'react';
import { useLocale, useTranslations } from 'use-intl';
import { DocumentTitle } from '../../components/DocumentTitle';
import { api, ApiFailure } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { ForbiddenContent } from '../AdminLayout';
import { canHandOver } from '../roles';
import { type PanelUser, UserSearch } from '../UserSearch';

const CATEGORIES = ['reviews_approvals', 'projects', 'documents', 'issues', 'followups'] as const;
type Category = (typeof CATEGORIES)[number];
type UserState = 'pending' | 'active' | 'blocked' | 'deactivated';

/** One piece of pending work (GET /users/{userId}/handover). */
interface PendingItem {
  category: Category;
  itemType: string;
  itemId: string;
  projectId: string | null;
  label: string;
}
interface HandoverView {
  id: string | null;
  fromUserId: string;
  pending: PendingItem[];
  outstandingCount: number;
  completedAt: string | null;
}
interface UserEnvelope {
  data: { id: string; displayName: string; state: UserState };
  meta: { etag: string };
}

const handoverKey = (userId: string) => ['admin', 'handover', userId] as const;
const userKey = (userId: string) => ['admin', 'user', userId] as const;

/**
 * The staff handover (SCR-064, BD-08, BR-034; plan
 * docs/plans/2026-10-12-1541-feat-registration-approval-handover-plan.md, R13, R14): the
 * Department Head or the Monitoring Team finds an official, hands the pending work by category to
 * other officials (one item or all), completes the handover and then deactivates the account. The
 * server refuses the deactivation while work is pending and checks the receiver's role.
 */
export function HandoverPage() {
  const { me } = useAuth();
  const t = useTranslations('admin.handover');
  const [official, setOfficial] = useState<PanelUser | null>(null);
  if (!me) return null;
  if (!canHandOver(me)) return <ForbiddenContent />;
  return (
    <>
      <DocumentTitle title={t('title')} />
      <h1 className="admin-title">{t('title')}</h1>
      <p className="m-0">{t('intro')}</p>
      <UserSearch
        label={t('search')}
        helper={t('search_hint')}
        selected={official}
        onSelect={setOfficial}
      />
      {official && <Handover key={official.id} official={official} />}
    </>
  );
}

function Handover({ official }: { official: PanelUser }) {
  const t = useTranslations('admin.handover');
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;
  const queryClient = useQueryClient();
  const [receiver, setReceiver] = useState<PanelUser | null>(null);
  const [deactivating, setDeactivating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const account = useQuery({
    queryKey: userKey(official.id),
    queryFn: () => api<UserEnvelope>(`/users/${official.id}`, { envelope: true }),
  });
  const handover = useQuery({
    queryKey: handoverKey(official.id),
    queryFn: () => api<HandoverView>(`/users/${official.id}/handover`),
  });
  const refreshed = (message: string, view?: HandoverView) => {
    setNotice(message);
    if (view) queryClient.setQueryData(handoverKey(official.id), view);
    void queryClient.invalidateQueries({ queryKey: handoverKey(official.id) });
    // each step bumps the account row, so the deactivation needs its new version (If-Match)
    void queryClient.invalidateQueries({ queryKey: userKey(official.id) });
  };
  const assign = useMutation({
    mutationFn: (items?: PendingItem[]) =>
      api<HandoverView>(`/users/${official.id}/handover`, {
        method: 'POST',
        body: {
          toUserId: receiver!.id,
          ...(items
            ? { items: items.map((i) => ({ itemType: i.itemType, itemId: i.itemId })) }
            : {}),
        },
      }),
    onMutate: () => setNotice(null),
    onSuccess: (view) => refreshed(t('assigned'), view),
  });
  const complete = useMutation({
    mutationFn: () =>
      api<HandoverView>(`/users/${official.id}/handover/complete`, { method: 'POST' }),
    onMutate: () => setNotice(null),
    onSuccess: (view) => refreshed(t('completed_now'), view),
  });
  const deactivate = useMutation({
    mutationFn: (reason: string) =>
      api(`/users/${official.id}/state`, {
        method: 'POST',
        body: { state: 'deactivated', reason: reason.trim() },
        headers: { 'If-Match': account.data!.meta.etag },
      }),
    onMutate: () => setNotice(null),
    onSuccess: () => {
      setDeactivating(false);
      deactivate.reset();
      setNotice(t('deactivated'));
      void queryClient.invalidateQueries({ queryKey: userKey(official.id) });
      void queryClient.invalidateQueries({ queryKey: handoverKey(official.id) });
    },
  });

  if (account.isPending || handover.isPending) return <Skeleton shape="row" count={3} />;
  const loadError = account.error ?? handover.error;
  if (loadError || !account.data || !handover.data)
    return (
      <ErrorState
        title={tc('state.error.text')}
        message={loadError instanceof ApiFailure ? loadError.message : undefined}
        requestId={loadError instanceof ApiFailure ? loadError.requestId : undefined}
        onRetry={() => {
          void account.refetch();
          void handover.refetch();
        }}
      />
    );
  const user = account.data.data;
  const view = handover.data;
  const deactivated = user.state === 'deactivated';
  const actionError = [assign.error, complete.error].find((e) => e instanceof ApiFailure) as
    ApiFailure | undefined;
  const deactivateError = deactivate.error instanceof ApiFailure ? deactivate.error : null;
  const busy = assign.isPending || complete.isPending;

  return (
    <div className="admin-panel-section">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="admin-subtitle">{user.displayName}</h2>
        <Badge
          tone={deactivated ? 'neutral' : user.state === 'active' ? 'success' : 'warning'}
          label={t(`state.${user.state}`)}
        />
      </div>
      {notice && (
        <Alert tone="success" live="status" onDismiss={() => setNotice(null)}>
          {notice}
        </Alert>
      )}
      {actionError && (
        <Alert tone="danger" live="alert">
          {actionError.details[0]?.message ?? actionError.message}
        </Alert>
      )}
      {deactivated ? (
        <Alert tone="info">{t('already')}</Alert>
      ) : (
        <>
          <h3 className="admin-group-title">{t('pending')}</h3>
          <UserSearch
            label={t('receiver')}
            helper={t('receiver_hint')}
            selected={receiver}
            onSelect={setReceiver}
          />
          <div>
            <Button
              icon={ArrowRightLeft}
              disabled={!receiver || view.pending.length === 0 || busy}
              loading={assign.isPending && assign.variables === undefined}
              onPress={() => assign.mutate(undefined)}
            >
              {t('assign_all')}
            </Button>
          </div>
          {CATEGORIES.map((category) => (
            <CategoryItems
              key={category}
              category={category}
              items={view.pending.filter((i) => i.category === category)}
              canAssign={receiver !== null && !busy}
              onAssign={(item) => assign.mutate([item])}
            />
          ))}
          {view.completedAt && view.pending.length === 0 ? (
            <p className="m-0">
              {t('completed', { date: formatDateTime(view.completedAt, locale) })}
            </p>
          ) : (
            <div>
              <Button
                variant="secondary"
                icon={CheckCheck}
                disabled={view.pending.length > 0 || busy}
                loading={complete.isPending}
                onPress={() => complete.mutate()}
              >
                {t('complete')}
              </Button>
            </div>
          )}
          <div>
            <Button
              variant="danger"
              icon={UserX}
              disabled={busy || account.isFetching}
              onPress={() => setDeactivating(true)}
            >
              {t('deactivate')}
            </Button>
          </div>
        </>
      )}
      <ConfirmDialog
        isOpen={deactivating}
        title={t('deactivate_title', { name: user.displayName })}
        message={
          deactivateError && (
            <p className="admin-error">
              {deactivateError.details[0]?.message ?? deactivateError.message}
            </p>
          )
        }
        consequence={[t('deactivate_consequence')]}
        tone="danger"
        reasonRequired
        reasonLabel={t('reason')}
        confirmLabel={t('deactivate_confirm')}
        pending={deactivate.isPending}
        onConfirm={(reason) => deactivate.mutate(reason)}
        onCancel={() => {
          deactivate.reset();
          setDeactivating(false);
        }}
      />
    </div>
  );
}

function CategoryItems({
  category,
  items,
  canAssign,
  onAssign,
}: {
  category: Category;
  items: PendingItem[];
  canAssign: boolean;
  onAssign: (item: PendingItem) => void;
}) {
  const t = useTranslations('admin.handover');
  const id = useId();
  return (
    <section aria-labelledby={id} className="admin-panel-group">
      <h4 id={id} className="admin-group-title">
        {t(`category.${category}`)}
      </h4>
      {items.length === 0 ? (
        <p className="admin-muted m-0">{t('category_empty')}</p>
      ) : (
        <ul className="m-0 grid gap-2 p-0" role="list">
          {items.map((item) => (
            <li
              key={`${item.itemType}:${item.itemId}`}
              className="flex flex-wrap items-center gap-2"
            >
              <span>{item.label}</span>
              <Button
                size="sm"
                variant="secondary"
                aria-label={t('assign_label', { item: item.label })}
                disabled={!canAssign}
                onPress={() => onAssign(item)}
              >
                {t('assign_one')}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
