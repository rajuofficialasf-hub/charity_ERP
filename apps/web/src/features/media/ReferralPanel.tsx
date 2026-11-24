import { formatDate } from '@css/shared/format';
import { type Locale, localized } from '@css/shared/i18n';
import { Alert, Button, Card, Chip, ConfirmDialog, DescriptionList, Stack, Text } from '@/ui';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useLocale, useTranslations } from 'use-intl';
import { AddressNames } from '../../components/AddressNames';
import { ThroughVolunteerChip } from '../../components/PersonMarks';
import { CommentDialog } from './CommentDialog';
import { decideReferral, type MediaReferral } from './media-api';
import { failureOf } from './work-errors';

type Decision = 'accept' | 'send_back' | 'reject';

const DONE: Record<Decision, 'decision.accepted' | 'decision.sent_back' | 'decision.rejected'> = {
  accept: 'decision.accepted',
  send_back: 'decision.sent_back',
  reject: 'decision.rejected',
};

/**
 * The referral as the Media Team reads it: who sent it and why, the decision and, for a director,
 * the decision buttons; then the person's allowed details and the official's comment.
 */
export function ReferralPanel({
  referral,
  onSaved,
}: {
  referral: MediaReferral;
  onSaved: (next: MediaReferral, text: string) => void;
}) {
  const t = useTranslations('media');
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;
  const [asking, setAsking] = useState<Decision | null>(null);
  const decide = useMutation({
    mutationFn: (body: { decision: Decision; comment?: string }) =>
      decideReferral(referral.id, body),
    onSuccess: (next, { decision }) => {
      setAsking(null);
      // eslint-disable-next-line security/detect-object-injection -- a typed decision
      onSaved(next, t(DONE[decision]));
    },
  });
  const failure = decide.error
    ? failureOf(decide.error, { stale: t('work.stale'), fallback: tc('state.error.text') }).text
    : null;
  const b = referral.beneficiary;
  const close = () => {
    decide.reset();
    setAsking(null);
  };
  const decision = referral.decidedBy
    ? t('decision.decided_by', {
        state: t(`state.${referral.state}`),
        name: referral.decidedBy.name,
        date: formatDate(referral.decidedAt ?? referral.referredAt),
      })
    : t('decision.waiting');
  return (
    <>
      <Card
        title={t('work.referral')}
        headingLevel={2}
        action={
          referral.mayDecide ? (
            <Stack direction="row" gap={2} wrap>
              <Button size="small" onClick={() => setAsking('accept')}>
                {t('decision.accept')}
              </Button>
              <Button variant="secondary" size="small" onClick={() => setAsking('send_back')}>
                {t('decision.send_back')}
              </Button>
              <Button variant="danger" size="small" onClick={() => setAsking('reject')}>
                {t('decision.reject')}
              </Button>
            </Stack>
          ) : null
        }
      >
        <Stack gap={2}>
          {asking === 'accept' && failure ? <Alert tone="error">{failure}</Alert> : null}
          <Text size="small" tone="muted">
            {t('referral.referred_by', {
              name: referral.referredBy.name,
              date: formatDate(referral.referredAt),
            })}
          </Text>
          <DescriptionList
            items={[
              {
                label: t('home.column.priority'),
                value: (
                  <Chip tone={referral.priority === 'high' ? 'warning' : 'neutral'}>
                    {t(`priority.${referral.priority}`)}
                  </Chip>
                ),
              },
              { label: t('work.note'), value: referral.note },
              ...(referral.story ? [{ label: t('work.story'), value: referral.story }] : []),
              { label: t('home.column.decision'), value: decision },
              ...(referral.decisionComment
                ? [{ label: t('decision.comment'), value: referral.decisionComment }]
                : []),
            ]}
          />
        </Stack>
      </Card>
      <Card title={t('work.beneficiary')} headingLevel={2}>
        <Stack gap={2}>
          <DescriptionList
            items={[
              { label: t('work.name'), value: b.name },
              { label: t('work.father'), value: b.fatherOrHusbandName },
              ...(b.ageYears !== null ? [{ label: t('work.age'), value: b.ageYears }] : []),
              { label: t('work.mobile'), value: b.mobile ?? <ThroughVolunteerChip /> },
              {
                label: t('work.address'),
                value: (
                  <>
                    {b.address.village}, <AddressNames address={b.address} />
                  </>
                ),
              },
              ...(b.occupation
                ? [{ label: t('work.occupation'), value: localized(b.occupation, locale) }]
                : []),
              ...(b.monthlyIncome
                ? [{ label: t('work.income'), value: `৳ ${b.monthlyIncome}` }]
                : []),
              {
                label: t('work.project'),
                value: `${localized(referral.project.name, locale)} (${localized(referral.program.name, locale)})`,
              },
              ...(referral.officialComment
                ? [{ label: t('work.official_comment'), value: referral.officialComment }]
                : []),
            ]}
          />
          <Text size="small" tone="muted">
            {t('work.hidden_note')}
          </Text>
        </Stack>
      </Card>
      <ConfirmDialog
        open={asking === 'accept'}
        title={t('decision.accept')}
        consequences={[t('decision.accept_note')]}
        confirmLabel={t('decision.accept')}
        pending={decide.isPending}
        onConfirm={() => decide.mutate({ decision: 'accept' })}
        onCancel={close}
      />
      {asking === 'send_back' || asking === 'reject' ? (
        <CommentDialog
          title={t(asking === 'send_back' ? 'decision.send_back_title' : 'decision.reject_title')}
          label={t(asking === 'send_back' ? 'decision.comment' : 'decision.reason')}
          confirmLabel={t(asking === 'send_back' ? 'decision.send_back' : 'decision.reject')}
          danger={asking === 'reject'}
          pending={decide.isPending}
          error={failure ?? undefined}
          onConfirm={(comment) => decide.mutate({ decision: asking, comment })}
          onClose={close}
        />
      ) : null}
    </>
  );
}
