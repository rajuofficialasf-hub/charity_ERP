import { formatDate } from '@css/shared/format';
import { linkProblem, youtubeThumbnail } from '@css/shared/media';
import { Icon, Text } from '@/ui';
import type { ReactNode } from 'react';
import { useTranslations } from 'use-intl';
import { useMediaLabels } from './use-media-lists';
import './media.css';

/**
 * One publication of a work: a YouTube link shows YouTube's own thumbnail, built from the video id
 * alone and loaded without a referrer, so YouTube never learns which profile showed it; any other
 * link shows the platform's icon. The video opens on the platform; there is no player in the app.
 */
export function WorkLinkCard({
  title,
  platformCode,
  link,
  publishedOn,
  youtubeId,
  children,
}: {
  title: string;
  platformCode: string;
  link: string | null;
  publishedOn: string | null;
  youtubeId: string | null;
  /** A line below the facts, such as the member's roles. */
  children?: ReactNode;
}) {
  const t = useTranslations('media.card');
  const labels = useMediaLabels();
  const platform = labels.platform(platformCode);
  // the server checked the link against its platform; the page opens nothing but an https link
  const safe = link && linkProblem(link, 'other') === null ? link : null;
  return (
    <div className="media-link-card">
      <span className="media-thumb">
        {youtubeId ? (
          <img
            src={youtubeThumbnail(youtubeId)}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        ) : labels.platformKind(platformCode) === 'youtube' ? (
          <Icon name="video" size={24} />
        ) : (
          <Icon name="message" size={24} />
        )}
      </span>
      <span className="media-link-meta">
        <strong>{title}</strong>
        <Text size="small" tone="muted">
          {publishedOn
            ? `${platform} · ${t('published_on', { date: formatDate(`${publishedOn}T00:00:00Z`) })}`
            : platform}
        </Text>
        {children}
        {safe ? (
          <a href={safe} target="_blank" rel="noopener noreferrer nofollow">
            {t('open', { platform })}
          </a>
        ) : (
          <Text size="small" tone="muted">
            {t('no_link')}
          </Text>
        )}
      </span>
    </div>
  );
}
