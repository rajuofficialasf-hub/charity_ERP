import { formatDateTime } from '@css/shared/format';
import type { Locale } from '@css/shared/i18n';
import { Badge, Button, ErrorState, Skeleton, Stack, Text } from '@css/ui';
import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'use-intl';
import { ChangeSummary } from './ChangeSummary';
import { FORMS_KEY, type FormVersion, formVersions } from './forms-api';

/**
 * Every version of the form, newest first: its number and state, when it was published, and the
 * change summary against the version before it. Opening one shows it in the builder; only the
 * draft can change.
 */
export function VersionList({
  formId,
  shown,
  onOpen,
}: {
  formId: string;
  /** The version the builder shows now. */
  shown: string;
  onOpen: (versionId: string) => void;
}) {
  const t = useTranslations('forms.builder');
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;
  const list = useQuery({
    queryKey: [...FORMS_KEY, 'versions', formId],
    queryFn: () => formVersions(formId),
  });
  if (list.isPending) return <Skeleton shape="row" count={2} />;
  if (list.error)
    return <ErrorState title={tc('state.error.text')} onRetry={() => void list.refetch()} />;
  const ordered = [...list.data].sort((a, b) => b.versionNo - a.versionNo);
  const before = (v: FormVersion) => list.data.find((o) => o.versionNo === v.versionNo - 1) ?? null;
  return (
    <Stack as="section" gap={3} aria-label={t('versions')}>
      <Text weight="bold">{t('versions')}</Text>
      <ul className="form-outline-list" aria-label={t('versions')}>
        {ordered.map((v) => {
          const name = t(
            v.status === 'draft'
              ? 'version_draft'
              : v.status === 'published'
                ? 'version_published'
                : 'version_retired',
            { n: String(v.versionNo) },
          );
          return (
            <li key={v.id} className={v.id === shown ? 'is-selected' : undefined}>
              <Stack gap={2}>
                <Stack direction="row" gap={2} wrap align="center" justify="between">
                  <Stack direction="row" gap={2} wrap align="center">
                    <Badge label={name} />
                    {v.publishedAt ? (
                      <Text tone="muted">
                        {t('published_at', { when: formatDateTime(v.publishedAt, locale) })}
                      </Text>
                    ) : null}
                  </Stack>
                  {v.id === shown ? null : (
                    <Button size="sm" variant="secondary" onPress={() => onOpen(v.id)}>
                      {t('open_version', { n: String(v.versionNo) })}
                    </Button>
                  )}
                </Stack>
                <ChangeSummary before={before(v)} after={v} />
              </Stack>
            </li>
          );
        })}
      </ul>
    </Stack>
  );
}
