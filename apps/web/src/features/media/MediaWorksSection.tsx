import { type Locale, localized } from '@css/shared/i18n';
import { Stack, Text } from '@/ui';
import { useLocale, useTranslations } from 'use-intl';
import type { PublishedWork } from './media-api';
import { useMediaLabels } from './use-media-lists';
import { WorkLinkCard } from './WorkLinkCard';
import './media.css';

/**
 * The published and done works about a person (the 360° profile) or of a member (the portfolio):
 * a card per publication with the title, program, date and the team's roles; `ownRoles` names the
 * member's own roles on a portfolio.
 */
export function MediaWorksSection({
  works,
  emptyText,
}: {
  works: (PublishedWork & { ownRoles?: string[] })[];
  emptyText: string;
}) {
  const t = useTranslations('media');
  const locale = useLocale() as Locale;
  const labels = useMediaLabels();
  if (!works.length) return <Text tone="muted">{emptyText}</Text>;
  const roles = (codes: string[]) => codes.map(labels.role).join(', ');
  // the member's own roles on a portfolio, the whole team on a profile
  const team = (w: (typeof works)[number]) =>
    w.ownRoles
      ? t('card.roles', { roles: roles(w.ownRoles) })
      : w.members.map((m) => `${m.name} (${roles(m.roles)})`).join(', ');
  return (
    <ul className="media-link-cards">
      {works.map((w) => (
        <li key={w.workId}>
          <Stack gap={2}>
            <Text size="small" tone="muted">
              {[
                localized(w.program.name, locale),
                localized(w.project.name, locale),
                t(`content.${w.contentType}`),
              ].join(' · ')}
            </Text>
            {w.summary && <Text>{w.summary}</Text>}
            {w.publications.length ? (
              w.publications.map((p, i) => (
                <WorkLinkCard
                  key={`${p.platformCode}-${i}`}
                  title={w.title}
                  platformCode={p.platformCode}
                  link={p.link}
                  publishedOn={p.publishedOn}
                  youtubeId={p.youtubeId}
                >
                  <Text size="small">{team(w)}</Text>
                </WorkLinkCard>
              ))
            ) : (
              // a work whose posts were all taken down keeps its place, without a link
              <Stack gap={1}>
                <Text>
                  <strong>{w.title}</strong>
                </Text>
                <Text size="small">{team(w)}</Text>
                <Text size="small" tone="muted">
                  {t('card.no_link')}
                </Text>
              </Stack>
            )}
          </Stack>
        </li>
      ))}
    </ul>
  );
}
