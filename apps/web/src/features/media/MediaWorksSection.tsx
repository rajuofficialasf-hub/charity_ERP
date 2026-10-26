import { type Locale, localized } from '@css/shared/i18n';
import { Grid, Text } from '@css/ui';
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
  return (
    <Grid gap={3} as="ul" role="list" className="media-link-cards">
      {works.map((w) => (
        <li key={w.workId}>
          <Grid gap={2}>
            <Text as="small" tone="muted">
              {[
                localized(w.program.name, locale),
                localized(w.project.name, locale),
                t(`content.${w.contentType}`),
              ].join(' · ')}
            </Text>
            {w.summary && <Text>{w.summary}</Text>}
            {(w.publications.length ? w.publications : [null]).map((p, i) => (
              <WorkLinkCard
                key={p ? `${p.platformCode}-${i}` : 'none'}
                title={w.title}
                platformCode={p?.platformCode ?? ''}
                link={p?.link ?? null}
                publishedOn={p?.publishedOn ?? w.publishedOn}
                youtubeId={p?.youtubeId ?? null}
              >
                <Text as="small">
                  {w.ownRoles
                    ? t('card.roles', { roles: roles(w.ownRoles) })
                    : w.members.map((m) => `${m.name} (${roles(m.roles)})`).join(', ')}
                </Text>
              </WorkLinkCard>
            ))}
          </Grid>
        </li>
      ))}
    </Grid>
  );
}
