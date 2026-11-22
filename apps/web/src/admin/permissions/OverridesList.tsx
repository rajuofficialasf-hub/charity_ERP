import type { PermissionOverride } from '@css/shared/access';
import { formatDate } from '@css/shared/format';
import { localized, type Locale } from '@css/shared/i18n';
import { Button, Skeleton, Stack } from '@/ui';
import { useQuery } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { useLocale, useTranslations } from 'use-intl';
import { api } from '../../api/client';
import { LoadError } from '../../components/LoadError';
import type { PanelUser } from '../UserSearch';
import { type EndingOverride, RevokeDialog } from './RevokeDialog';

export const overridesKey = (userId: string) => ['admin', 'overrides', userId] as const;

/**
 * What the panel gave a person and what it took away, live (docs/ui/SCREENS.md "Permission
 * panel"; docs/security/RBAC.md, "Permission panel"): two lists, each override by its name and
 * code, its scope by name, who wrote it, when and why, and its end: a given permission is
 * withdrawn, a permission taken away is given back. A revoke of one project, program or area from
 * a broader grant shows here, as the effective list cannot show it.
 */
export function OverridesList({
  user,
  onChanged,
}: {
  user: PanelUser;
  onChanged: (message: string) => void;
}) {
  const t = useTranslations('admin.permissions');
  const headingId = useId();
  const [ending, setEnding] = useState<EndingOverride | null>(null);
  const rows = useQuery({
    queryKey: overridesKey(user.id),
    queryFn: () => api<PermissionOverride[]>(`/users/${user.id}/permission-overrides`),
  });
  const given = (rows.data ?? []).filter((r) => r.effect === 'grant');
  const taken = (rows.data ?? []).filter((r) => r.effect === 'revoke');

  return (
    <section aria-labelledby={headingId} className="admin-panel-section">
      <h2 id={headingId} className="admin-subtitle">
        {t('overrides.title')}
      </h2>
      {rows.isPending ? (
        <Skeleton count={2} />
      ) : rows.error ? (
        <LoadError error={rows.error} onRetry={() => void rows.refetch()} />
      ) : (
        <>
          <Group
            title={t('overrides.given')}
            empty={t('overrides.given_none')}
            rows={given}
            onEnd={setEnding}
          />
          <Group
            title={t('overrides.taken')}
            empty={t('overrides.taken_none')}
            rows={taken}
            onEnd={setEnding}
          />
        </>
      )}
      <RevokeDialog
        override={ending}
        onClose={() => setEnding(null)}
        onDone={(effect) => {
          setEnding(null);
          onChanged(effect === 'revoke' ? t('lifted') : t('ended'));
        }}
      />
    </section>
  );
}

function Group({
  title,
  empty,
  rows,
  onEnd,
}: {
  title: string;
  empty: string;
  rows: PermissionOverride[];
  onEnd: (override: EndingOverride) => void;
}) {
  const t = useTranslations('admin.permissions');
  const locale = useLocale() as Locale;
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="admin-panel-group">
      <h3 id={headingId} className="admin-group-title">
        {title}
      </h3>
      {rows.length === 0 ? (
        <p className="admin-muted">{empty}</p>
      ) : (
        <ul className="admin-plain-list">
          {rows.map((r) => {
            const name = localized(r.title, locale);
            const lifting = r.effect === 'revoke';
            return (
              <li key={r.id}>
                <Stack direction="row" wrap align="center" gap={2}>
                  <strong>{name}</strong>
                  <code>{r.permission}</code>
                  <span>
                    {r.scopeName
                      ? t('overrides.where', {
                          scope: t(`scope.${r.scopeType}`),
                          name: localized(r.scopeName, locale),
                        })
                      : t(`scope.${r.scopeType}`)}
                  </span>
                  {r.grantedBy && (
                    <span className="admin-muted">
                      {t('overrides.by', {
                        name: r.grantedBy.displayName,
                        date: formatDate(r.grantedAt),
                      })}
                    </span>
                  )}
                  {r.reason && (
                    <span className="admin-muted">
                      {t('overrides.reason', { reason: r.reason })}
                    </span>
                  )}
                  {r.expiresAt && (
                    <span className="admin-muted">
                      {t('overrides.until', { date: formatDate(r.expiresAt) })}
                    </span>
                  )}
                  <Button
                    variant="secondary"
                    size="small"
                    ariaLabel={
                      lifting
                        ? t('lift_label', { permission: name })
                        : t('end_label', { permission: name })
                    }
                    onClick={() => onEnd({ id: r.id, label: name, effect: r.effect })}
                  >
                    {lifting ? t('lift') : t('end')}
                  </Button>
                </Stack>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
