import type { AnswerValue } from '@css/shared';
import { formatGps } from '@css/shared/format';
import { Alert, Button, Stack, Text } from '@css/ui';
import { useState } from 'react';
import { useTranslations } from 'use-intl';

type GpsAnswer = Extract<AnswerValue, { t: 'gps' }>;

/** A position question: the device's position on a tap, shown with its accuracy. */
export function GpsField({
  label,
  helper,
  error,
  value,
  onChange,
}: {
  label: string;
  name: string;
  required: boolean;
  helper?: string;
  error?: string;
  value: GpsAnswer | undefined;
  onChange: (value: AnswerValue | null) => void;
}) {
  const t = useTranslations('forms.renderer');
  const [status, setStatus] = useState<'idle' | 'taking' | 'denied' | 'unavailable'>('idle');
  const take = () => {
    if (!('geolocation' in navigator)) return setStatus('unavailable');
    setStatus('taking');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setStatus('idle');
        onChange({
          t: 'gps',
          lat: coords.latitude,
          lng: coords.longitude,
          ...(Number.isFinite(coords.accuracy) ? { accuracy_m: coords.accuracy } : {}),
          captured_at: new Date().toISOString(),
        });
      },
      (failure) => setStatus(failure.code === failure.PERMISSION_DENIED ? 'denied' : 'unavailable'),
      { enableHighAccuracy: true, timeout: 20_000 },
    );
  };
  return (
    <Stack gap={2} role="group" aria-label={label}>
      <Text weight="bold">{label}</Text>
      {helper ? <Text tone="muted">{helper}</Text> : null}
      {value ? <Text>{formatGps(value.lat, value.lng, value.accuracy_m)}</Text> : null}
      <div>
        <Button variant="secondary" onPress={take} loading={status === 'taking'}>
          {status === 'taking' ? t('gps_taking') : value ? t('gps_retake') : t('gps_take')}
        </Button>
      </div>
      {status === 'denied' ? <Alert tone="warning">{t('gps_denied')}</Alert> : null}
      {status === 'unavailable' ? <Alert tone="warning">{t('gps_unavailable')}</Alert> : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </Stack>
  );
}
