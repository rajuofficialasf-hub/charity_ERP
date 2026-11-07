import { formatDateTime } from '@css/shared/format';
import type { Locale } from '@css/shared/i18n';
import { Button, Chip, Skeleton, Stack, Text } from '@/ui';
import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'use-intl';
import { ChangeSummary } from './ChangeSummary';
import { FORMS_KEY, type FormVersionListItem, formVersions } from './forms-api';
import { LoadError } from '../../components/LoadError';

/**
 * Every version of the form, newest first: its number and state, who published it and when (who
 * changed the draft last and when), and the change summary against the version before it. Opening one shows it in the builder; only the
 * draft can change.
 */
export function VersionList({
  formId,
  shown,
  canOpen,
  onOpen,
}: {
  formId: string;
  /** The version the builder shows now. */
  shown: string;
  /** False while a change waits to be saved, so the draft is never shown under another name. */
  canOpen: boolean;
  onOpen: (versionId: string) => void;
}) {
  const t = useTranslations('forms.builder');
  const locale = useLocale() as Locale;
  const list = useQuery({
    queryKey: [...FORMS_KEY, 'versions', formId],
    queryFn: () => formVersions(formId),
  });
  if (list.isPending) return <Skeleton shape="row" count={2} />;
  if (list.error) return <LoadError error={list.error} onRetry={() => void list.refetch()} />;
  const ordered = [...list.data].sort((a, b) => b.versionNo - a.versionNo);
  // a published or retired version names who published it; the draft who changed it last
  const byline = (v: FormVersionListItem) =>
    v.publishedAt
      ? v.publishedBy
        ? t('published_by', {
            when: formatDateTime(v.publishedAt, locale),
            name: v.publishedBy.name,
          })
        : t('published_at', { when: formatDateTime(v.publishedAt, locale) })
      : v.updatedBy
        ? t('changed_by', { when: formatDateTime(v.updatedAt, locale), name: v.updatedBy.name })
        : t('changed_at', { when: formatDateTime(v.updatedAt, locale) });
  const before = (v: FormVersionListItem) =>
    list.data.find((o) => o.versionNo === v.versionNo - 1) ?? null;
  return (
    <div>
      <Stack gap={3}>
        <Text>
          <strong>{t('versions')}</strong>
        </Text>
        <ul className="fb-version-list" aria-label={t('versions')}>
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
                      <Chip>{name}</Chip>
                      <Text tone="muted">{byline(v)}</Text>
                    </Stack>
                    {v.id === shown ? null : (
                      <Button
                        size="small"
                        variant="secondary"
                        disabled={!canOpen}
                        onClick={() => onOpen(v.id)}
                      >
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
    </div>
  );
}
