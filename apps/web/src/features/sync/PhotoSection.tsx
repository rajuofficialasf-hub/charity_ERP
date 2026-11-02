import { formatCount, formatDecimal, formatFileSize } from '@css/shared/format';
import type { Locale } from '@css/shared/i18n';
import { Button, ProgressBar } from '@css/ui';
import { useLocale, useTranslations } from 'use-intl';
import type { Overview } from '../../offline/applications-store';

const MB = 1024 * 1024;

/**
 * The photo queue of the sync centre: how many photos wait and how many went, the room they
 * take against this phone's budget, and the way to free the room of the photos already sent.
 */
export function PhotoSection({
  photos,
  busy,
  onFree,
  freeLabel,
}: {
  photos: Overview['photos'];
  busy: boolean;
  onFree: () => void;
  freeLabel: string;
}) {
  const t = useTranslations('sync.centre');
  const locale = useLocale() as Locale;
  const { usage } = photos;
  const tone = usage.level === 'full' ? 'danger' : usage.level === 'warn' ? 'warning' : 'brand';
  return (
    <section className="sync-photos" aria-labelledby="sync-photos-title">
      <h2 id="sync-photos-title">{t('group.photos')}</h2>
      <p>
        {t('photos_waiting', {
          n: photos.waitingCount,
          count: formatCount(photos.waitingCount, locale),
          size: formatFileSize(photos.waitingBytes, locale),
        })}
      </p>
      <p>
        {t('photos_uploaded', {
          n: photos.uploadedCount,
          count: formatCount(photos.uploadedCount, locale),
          size: formatFileSize(photos.uploadedBytes, locale),
        })}
      </p>
      <ProgressBar
        value={usage.usedBytes}
        max={usage.budgetBytes}
        label={t('budget')}
        showValue={false}
        tone={tone}
      />
      <p>
        {t('budget_used', {
          used: formatDecimal(usage.usedBytes / MB, 1, locale),
          budget: formatCount(Math.round(usage.budgetBytes / MB), locale),
        })}
      </p>
      {photos.uploadedCount > 0 && (
        <div>
          <Button variant="secondary" size="sm" loading={busy} onPress={onFree}>
            {freeLabel}
          </Button>
        </div>
      )}
    </section>
  );
}
