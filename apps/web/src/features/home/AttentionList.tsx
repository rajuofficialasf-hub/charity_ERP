import type { AttentionKind } from '@css/shared';
import { formatCount } from '@css/shared/format';
import type { Locale } from '@css/shared/i18n';
import { AttentionCard, type ExtendedIconName } from '@/ui';
import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'use-intl';
import { useSyncAttention } from '../sync/use-sync-store';
import { ATTENTION_KEY, attention } from './home-api';
import { Loaded } from './Loaded';

const LOOK: Record<AttentionKind, { icon: ExtendedIconName; tone: 'info' | 'warning' }> = {
  unread_notifications: { icon: 'bell', tone: 'info' },
  consent_pending: { icon: 'checklist', tone: 'warning' },
  corrections: { icon: 'file-edit', tone: 'warning' },
  edit_answered: { icon: 'success', tone: 'info' },
  registrations_pending: { icon: 'user-check', tone: 'info' },
  staff_registrations_pending: { icon: 'user-check', tone: 'info' },
  edit_requests_pending: { icon: 'file', tone: 'info' },
  projects_draft: { icon: 'folder-edit', tone: 'info' },
  deadlines_soon: { icon: 'schedule', tone: 'warning' },
  handovers_open: { icon: 'transfer', tone: 'warning' },
  unlocks_to_fill: { icon: 'unlock', tone: 'warning' },
  unlocks_to_verify: { icon: 'unlock', tone: 'info' },
  verifications_pending: { icon: 'user-check', tone: 'info' },
  media_referrals_new: { icon: 'video', tone: 'info' },
  media_review_waiting: { icon: 'video', tone: 'info' },
  media_sent_back: { icon: 'video', tone: 'warning' },
  media_on_hold: { icon: 'pause', tone: 'warning' },
  sync_failed: { icon: 'offline', tone: 'warning' },
  sync_verifying: { icon: 'user-check', tone: 'info' },
  photos_pending: { icon: 'camera', tone: 'warning' },
};

/**
 * "Needs your attention", the first widget of every home: what waits for the person now, each
 * item linking to the list that holds it; a calm empty state when nothing waits. A module's own
 * home passes its `kinds`. A volunteer's items of this phone (records that could not be sent,
 * records under verification, photos still to go) come first, before the server's.
 */
export function AttentionList({ kinds }: { kinds?: readonly AttentionKind[] } = {}) {
  const t = useTranslations('home.attention');
  const locale = useLocale() as Locale;
  // a page of one module shows only its own items
  const shown = (item: { kind: AttentionKind }) => !kinds || kinds.includes(item.kind);
  const local = useSyncAttention().filter(shown);
  // asked again each time the home opens: the person may just have acted on an item
  const items = useQuery({
    queryKey: ATTENTION_KEY,
    queryFn: attention,
    staleTime: 0,
    refetchOnMount: 'always',
  });
  return (
    <section className="my-work-attention" aria-labelledby="attention-title">
      <h2 id="attention-title" className="my-work-heading">
        {t('title')}
      </h2>
      <Loaded
        query={items}
        empty={t('empty')}
        emptyIcon="success"
        isEmpty={(data) => data.filter(shown).length + local.length === 0}
      >
        {(data) => (
          <ul className="my-work-list">
            {[...local, ...data.filter(shown)].map((item) => (
              <li key={item.kind}>
                <AttentionCard
                  {...LOOK[item.kind]}
                  title={t(`kind.${item.kind}`, {
                    n: item.count,
                    count: formatCount(item.count, locale),
                  })}
                  to={item.href}
                />
              </li>
            ))}
          </ul>
        )}
      </Loaded>
    </section>
  );
}
