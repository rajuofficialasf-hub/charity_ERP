import { DescriptionList, Skeleton, Text } from '@/ui';
import { formatDateTime, formatFileSize, formatGps } from '@css/shared/format';
import type { Locale } from '@css/shared/i18n';
import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'use-intl';
import { detailsKey, photoDetails } from './photos-api';

/** The map site's own address of a position; the place leaves the app only when this is pressed. */
const mapAddress = (lat: number, lng: number) =>
  `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

/**
 * What the server keeps of a photo (docs/architecture/FILES_AND_DOCUMENTS.md, "Download of a
 * photo"): when it was taken, where with the accuracy and a link to the map, its size and
 * resolution, who uploaded it and when. A detail the server does not have says so; the position
 * of a reader who may not see it is not listed at all.
 */
export function PhotoDetails({ fileId }: { fileId: string }) {
  const t = useTranslations('photos.details');
  const common = useTranslations('common');
  const locale = useLocale() as Locale;
  // the details leave the cache with the viewer, as the photo does
  const details = useQuery({
    queryKey: detailsKey(fileId),
    queryFn: () => photoDetails(fileId),
    gcTime: 0,
  });
  if (details.isPending) return <Skeleton shape="text" />;
  if (details.isError) return <Text tone="muted">{common('state.error.text')}</Text>;
  const d = details.data;
  const unknown = t('unknown');
  const items = [
    { label: t('taken'), value: d.capturedAt ? formatDateTime(d.capturedAt, locale) : unknown },
    ...(d.gps === undefined
      ? []
      : [
          {
            label: t('place'),
            value: d.gps ? (
              <span className="photo-details-place">
                <span>{formatGps(d.gps.lat, d.gps.lng, d.gps.accuracyM ?? undefined)}</span>
                <a
                  href={mapAddress(d.gps.lat, d.gps.lng)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t('map')}
                </a>
              </span>
            ) : (
              unknown
            ),
          },
        ]),
    { label: t('size'), value: formatFileSize(d.sizeBytes, locale) },
    {
      label: t('resolution'),
      value:
        d.width && d.height
          ? t('resolutionValue', { width: String(d.width), height: String(d.height) })
          : unknown,
    },
    { label: t('uploadedBy'), value: d.uploadedBy?.name ?? unknown },
    { label: t('uploadedAt'), value: formatDateTime(d.uploadedAt, locale) },
  ];
  return <DescriptionList items={items} layout="grid" columns={2} />;
}
