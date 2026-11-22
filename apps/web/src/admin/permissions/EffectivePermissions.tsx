import type { EffectivePermission, PermissionInfo, Role } from '@css/shared/access';
import { localized, type Locale } from '@css/shared/i18n';
import {
  Alert,
  Button,
  DataTable,
  EmptyState,
  Skeleton,
  Text,
  type DataTableExtendedColumn,
} from '@/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { useLocale, useTranslations } from 'use-intl';
import { api, ApiFailure } from '../../api/client';
import type { PanelUser } from '../UserSearch';
import { GrantDialog } from './GrantDialog';
import { OverridesList, overridesKey } from './OverridesList';
import { LoadError } from '../../components/LoadError';

export const permissionCatalogue = () => api<PermissionInfo[]>('/permissions');
const roleCatalogue = () => api<Role[]>('/roles');
const effectiveKey = (userId: string) => ['admin', 'effective', userId] as const;

interface Row extends EffectivePermission {
  key: string;
  module: string;
  name: string;
  where: string;
}

/**
 * The roles (read only) and the effective permissions of one user, grouped by module, each by its
 * name and code with its scope by name; below them what the panel gave and took away, where each
 * is ended. A change in the panel reads both again.
 */
export function EffectivePermissions({ user }: { user: PanelUser }) {
  const t = useTranslations('admin.permissions');
  const locale = useLocale() as Locale;
  const headingId = useId();
  const queryClient = useQueryClient();
  const [granting, setGranting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const effective = useQuery({
    queryKey: effectiveKey(user.id),
    queryFn: () => api<EffectivePermission[]>(`/users/${user.id}/effective-permissions`),
  });
  const permissions = useQuery({
    queryKey: ['admin', 'permissions'],
    queryFn: permissionCatalogue,
  });
  const roles = useQuery({ queryKey: ['admin', 'roles'], queryFn: roleCatalogue });

  const catalogue = new Map((permissions.data ?? []).map((p) => [p.name, p]));
  const roleName = (key: string) => roles.data?.find((r) => r.key === key)?.name[locale] ?? key;
  const rows: Row[] = (effective.data ?? []).map((g, i) => {
    const def = catalogue.get(g.permission);
    return {
      ...g,
      key: `${g.permission}|${g.scopeType}|${g.scopeRef ?? ''}|${g.projectId ?? ''}|${g.source}|${g.grantId ?? i}`,
      module: def?.module ?? '—',
      name: def ? localized(def.title, locale) : g.permission,
      where: g.scopeName
        ? t('overrides.where', {
            scope: t(`scope.${g.scopeType}`),
            name: localized(g.scopeName, locale),
          })
        : t(`scope.${g.scopeType}`),
    };
  });
  const modules = [...new Set(rows.map((r) => r.module))].sort();
  // any failure, also one without an API answer (offline), shows the error state, never an empty list
  const failure = effective.error ?? permissions.error ?? roles.error;
  const refresh = (message: string) => {
    setNotice(message);
    void queryClient.invalidateQueries({ queryKey: effectiveKey(user.id) });
    void queryClient.invalidateQueries({ queryKey: overridesKey(user.id) });
  };

  const columns: DataTableExtendedColumn<Row>[] = [
    {
      id: 'permission',
      header: t('column.permission'),
      cell: (r) => (
        <span className="admin-permission-name">
          <span>{r.name}</span> <code>{r.permission}</code>
        </span>
      ),
      isRowHeader: true,
    },
    { id: 'scope', header: t('column.scope'), cell: (r) => r.where },
    { id: 'source', header: t('column.source'), cell: (r) => t(`source.${r.source}`) },
  ];

  return (
    <>
      <section aria-labelledby={headingId} className="admin-panel-section">
        <h2 id={headingId} className="admin-subtitle">
          {t('effective')}
        </h2>
        <Text>
          <strong>{t('roles')}:</strong> {user.roles.map(roleName).join(', ')}
        </Text>
        <div>
          <Button startIcon="key" onClick={() => setGranting(true)}>
            {t('grant')}
          </Button>
        </div>
        {notice && (
          <Alert tone="success" onDismiss={() => setNotice(null)}>
            {notice}
          </Alert>
        )}
        {failure && (
          <LoadError
            error={failure}
            message={failure instanceof ApiFailure ? failure.message : undefined}
            onRetry={() => {
              void effective.refetch();
              void permissions.refetch();
              void roles.refetch();
            }}
          />
        )}
        {effective.isPending && <Skeleton shape="row" count={4} />}
        {effective.data && rows.length === 0 && <EmptyState title={t('effective_empty')} />}
        {modules.map((module) => {
          const inModule = rows.filter((r) => r.module === module);
          const title = t('module', { module });
          return (
            <div key={module} className="admin-panel-group">
              <h3 className="admin-group-title">{title}</h3>
              <DataTable
                label={title}
                columns={columns}
                rows={inModule}
                getRowId={(r) => r.key}
                rowLabel={(r) => r.name}
                cardRenderer={(r) => (
                  <div className="admin-permission-card">
                    <strong>{r.name}</strong>
                    <code>{r.permission}</code>
                    <span>{r.where}</span>
                    <span>{t(`source.${r.source}`)}</span>
                  </div>
                )}
              />
            </div>
          );
        })}
        <GrantDialog
          user={user}
          open={granting}
          onClose={() => setGranting(false)}
          onDone={(effect) => {
            setGranting(false);
            refresh(effect === 'grant' ? t('granted') : t('removed'));
          }}
        />
      </section>
      <OverridesList user={user} onChanged={refresh} />
    </>
  );
}
