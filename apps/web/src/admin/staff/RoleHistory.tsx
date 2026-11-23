import { formatDate } from '@css/shared/format';
import { localized, type Locale } from '@css/shared/i18n';
import { Chip, ProfileSection, Skeleton, Stack } from '@/ui';
import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'use-intl';
import { ApiFailure } from '../../api/client';
import { LoadError } from '../../components/LoadError';
import { roleHistory, roleHistoryKey } from './staff-api';

/**
 * The roles an official holds and held, the newest first, each with who gave it and when, and who
 * ended it (docs/BUSINESS_RULES.md, "An official's role is changed"). The server answers the
 * holders of `permission.view` who reach the person; for anyone else the section is left out.
 */
export function RoleHistory({ userId }: { userId: string }) {
  const t = useTranslations('admin.staff.role_history');
  const locale = useLocale() as Locale;
  const rows = useQuery({
    queryKey: roleHistoryKey(userId),
    queryFn: () => roleHistory(userId),
    retry: false,
  });
  if (rows.error instanceof ApiFailure && [403, 404].includes(rows.error.status)) return null;
  return (
    <ProfileSection title={t('title')} icon="history">
      {rows.isPending ? (
        <Skeleton count={2} />
      ) : rows.error ? (
        <LoadError error={rows.error} onRetry={() => void rows.refetch()} />
      ) : rows.data.length === 0 ? (
        <p className="admin-muted">{t('none')}</p>
      ) : (
        <ol className="admin-plain-list">
          {rows.data.map((r) => (
            <li key={r.id}>
              <Stack direction="row" wrap align="center" gap={2}>
                <strong>{localized(r.name, locale)}</strong>
                {r.revokedAt === null && <Chip tone="success">{t('now')}</Chip>}
                <span className="admin-muted">
                  {r.grantedBy
                    ? t('given_by', {
                        name: r.grantedBy.displayName,
                        date: formatDate(r.grantedAt),
                      })
                    : t('given_by_system', { date: formatDate(r.grantedAt) })}
                </span>
                {r.revokedAt && r.revokedBy && (
                  <span className="admin-muted">
                    {t('ended_by', {
                      name: r.revokedBy.displayName,
                      date: formatDate(r.revokedAt),
                    })}
                  </span>
                )}
              </Stack>
            </li>
          ))}
        </ol>
      )}
    </ProfileSection>
  );
}
