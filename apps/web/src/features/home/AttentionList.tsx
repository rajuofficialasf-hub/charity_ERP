import type { AttentionKind } from '@css/shared';
import { formatCount } from '@css/shared/format';
import type { Locale } from '@css/shared/i18n';
import { AttentionCard, type IconComponent } from '@css/ui';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRightLeft,
  Bell,
  CalendarClock,
  CircleCheck,
  Clapperboard,
  FilePenLine,
  FileText,
  FolderPen,
  ListChecks,
  LockOpen,
  PauseCircle,
  UserCheck,
  UserRoundCheck,
} from 'lucide-react';
import { useLocale, useTranslations } from 'use-intl';
import { ATTENTION_KEY, attention } from './home-api';
import { Loaded } from './Loaded';

const LOOK: Record<AttentionKind, { icon: IconComponent; tone: 'info' | 'warning' }> = {
  unread_notifications: { icon: Bell, tone: 'info' },
  consent_pending: { icon: ListChecks, tone: 'warning' },
  corrections: { icon: FilePenLine, tone: 'warning' },
  edit_answered: { icon: CircleCheck, tone: 'info' },
  registrations_pending: { icon: UserCheck, tone: 'info' },
  staff_registrations_pending: { icon: UserRoundCheck, tone: 'info' },
  edit_requests_pending: { icon: FileText, tone: 'info' },
  projects_draft: { icon: FolderPen, tone: 'info' },
  deadlines_soon: { icon: CalendarClock, tone: 'warning' },
  handovers_open: { icon: ArrowRightLeft, tone: 'warning' },
  unlocks_to_fill: { icon: LockOpen, tone: 'warning' },
  unlocks_to_verify: { icon: LockOpen, tone: 'info' },
  verifications_pending: { icon: UserCheck, tone: 'info' },
  media_referrals_new: { icon: Clapperboard, tone: 'info' },
  media_review_waiting: { icon: Clapperboard, tone: 'info' },
  media_sent_back: { icon: Clapperboard, tone: 'warning' },
  media_on_hold: { icon: PauseCircle, tone: 'warning' },
};

/**
 * "Needs your attention", the first widget of every home: what waits for the person now, each
 * item linking to the list that holds it; a calm empty state when nothing waits. A module's own
 * home passes its `kinds`.
 */
export function AttentionList({ kinds }: { kinds?: readonly AttentionKind[] } = {}) {
  const t = useTranslations('home.attention');
  const locale = useLocale() as Locale;
  // a page of one module shows only its own items
  const shown = (item: { kind: AttentionKind }) => !kinds || kinds.includes(item.kind);
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
        emptyIcon={CircleCheck}
        isEmpty={(data) => data.filter(shown).length === 0}
      >
        {(data) => (
          <ul className="my-work-list">
            {data.filter(shown).map((item) => (
              <li key={item.kind}>
                <AttentionCard
                  {...LOOK[item.kind]}
                  title={t(`kind.${item.kind}`, {
                    n: item.count,
                    count: formatCount(item.count, locale),
                  })}
                  href={item.href}
                />
              </li>
            ))}
          </ul>
        )}
      </Loaded>
    </section>
  );
}
