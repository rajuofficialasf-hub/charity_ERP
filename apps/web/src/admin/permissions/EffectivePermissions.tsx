import type { EffectivePermission, PermissionInfo, Role } from '@css/shared/access';
import type { Locale } from '@css/shared/i18n';
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
import { api } from '../../lib/api';
import type { PanelUser } from '../UserSearch';
import { GrantDialog } from './GrantDialog';
import { RevokeDialog } from './RevokeDialog';
import { LoadError } from '../../components/LoadError';

export const permissionCatalogue = () => api<PermissionInfo[]>('/permissions');
const roleCatalogue = () => api<Role[]>('/roles');
const effectiveKey = (userId: string) => ['admin', 'effective', userId] as const;

interface Row extends EffectivePermission {
  key: string;
  module: string;
}

/** The roles (read only) and the effective permissions of one user, grouped by module. */
export function EffectivePermissions({ user }: { user: PanelUser }) {
  const t = useTranslations('admin.permissions');
  const locale = useLocale() as Locale;
  const headingId = useId();
  const queryClient = useQueryClient();
  const [granting, setGranting] = useState(false);
  const [ending, setEnding] = useState<EffectivePermission | null>(null);
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

  const moduleOf = new Map((permissions.data ?? []).map((p) => [p.name, p.module]));
  const roleName = (key: string) => roles.data?.find((r) => r.key === key)?.name[locale] ?? key;
  const rows: Row[] = (effective.data ?? []).map((g, i) => ({
    ...g,
    key: `${g.permission}|${g.scopeType}|${g.scopeRef ?? ''}|${g.source}|${g.grantId ?? i}`,
    module: moduleOf.get(g.permission) ?? '—',
  }));
  const modules = [...new Set(rows.map((r) => r.module))].sort();
  // any failure, also one without an API answer (offline), shows the error state, never an empty list
  const failure = effective.error ?? permissions.error ?? roles.error;
  const refresh = (message: string) => {
    setNotice(message);
    void queryClient.invalidateQueries({ queryKey: effectiveKey(user.id) });
  };

  const endButton = (row: Row) =>
    row.source === 'panel_grant' && row.grantId ? (
      <Button
        variant="secondary"
        size="small"
        ariaLabel={t('end_label', { permission: row.permission })}
        onClick={() => setEnding(row)}
      >
        {t('end')}
      </Button>
    ) : null;
  const columns: DataTableExtendedColumn<Row>[] = [
    {
      id: 'permission',
      header: t('column.permission'),
      cell: (r) => <code>{r.permission}</code>,
      isRowHeader: true,
    },
    { id: 'scope', header: t('column.scope'), cell: (r) => t(`scope.${r.scopeType}`) },
    { id: 'source', header: t('column.source'), cell: (r) => t(`source.${r.source}`) },
  ];

  return (
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
          error={effective.error}
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
              rowLabel={(r) => r.permission}
              rowActions={endButton}
              cardRenderer={(r) => (
                <div className="admin-permission-card">
                  <code>{r.permission}</code>
                  <span>{t(`scope.${r.scopeType}`)}</span>
                  <span>{t(`source.${r.source}`)}</span>
                  {endButton(r)}
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
      <RevokeDialog
        grant={ending}
        onClose={() => setEnding(null)}
        onDone={() => {
          setEnding(null);
          refresh(t('ended'));
        }}
      />
    </section>
  );
}
