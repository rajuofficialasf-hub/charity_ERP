import type { EffectivePermission, PermissionInfo, Role } from '@css/shared/access';
import type { Locale } from '@css/shared/i18n';
import { Alert, Button, EmptyState, ErrorState, Skeleton, Table, type TableColumn } from '@css/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound } from 'lucide-react';
import { useId, useState } from 'react';
import { useLocale, useTranslations } from 'use-intl';
import { api, ApiFailure } from '../../lib/api';
import { GrantDialog } from './GrantDialog';
import { RevokeDialog } from './RevokeDialog';

/** A user as the user list returns it (GET /users). */
export interface PanelUser {
  id: string;
  displayName: string;
  designation: string | null;
  roles: string[];
}

export const permissionCatalogue = () => api<PermissionInfo[]>('/permissions');
const roleCatalogue = () => api<Role[]>('/roles');
export const effectiveKey = (userId: string) => ['admin', 'effective', userId] as const;

interface Row extends EffectivePermission {
  key: string;
}

/** The roles (read only) and the effective permissions of one user, grouped by module. */
export function EffectivePermissions({ user }: { user: PanelUser }) {
  const t = useTranslations('admin.permissions');
  const tc = useTranslations('common');
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
  }));
  const modules = [...new Set(rows.map((r) => moduleOf.get(r.permission) ?? '—'))].sort();
  const failure = [effective.error, permissions.error, roles.error].find(
    (e) => e instanceof ApiFailure,
  );
  const refresh = (message: string) => {
    setNotice(message);
    void queryClient.invalidateQueries({ queryKey: effectiveKey(user.id) });
  };

  const endButton = (row: Row) =>
    row.source === 'panel_grant' && row.grantId ? (
      <Button
        variant="secondary"
        size="sm"
        aria-label={t('end_label', { permission: row.permission })}
        onPress={() => setEnding(row)}
      >
        {t('end')}
      </Button>
    ) : null;
  const columns: TableColumn<Row>[] = [
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
      <p className="m-0">
        <strong>{t('roles')}:</strong> {user.roles.map(roleName).join(', ')}{' '}
        <span className="admin-muted">{t('roles_hint')}</span>
      </p>
      <div>
        <Button icon={KeyRound} onPress={() => setGranting(true)}>
          {t('grant')}
        </Button>
      </div>
      {notice && (
        <Alert tone="success" live="status" onDismiss={() => setNotice(null)}>
          {notice}
        </Alert>
      )}
      {failure && (
        <ErrorState
          title={tc('state.error.text')}
          message={failure.message}
          requestId={failure.requestId}
          onRetry={() => void effective.refetch()}
        />
      )}
      {effective.isPending && <Skeleton shape="row" count={4} />}
      {effective.data && rows.length === 0 && (
        <EmptyState icon={KeyRound} title={t('effective_empty')} headingLevel={3} />
      )}
      {modules.map((module) => {
        const inModule = rows.filter((r) => (moduleOf.get(r.permission) ?? '—') === module);
        const title = t('module', { module });
        return (
          <div key={module} className="admin-panel-group">
            <h3 className="admin-group-title">{title}</h3>
            <Table
              label={title}
              columns={columns}
              rows={inModule}
              rowKey={(r) => r.key}
              rowLabel={(r) => r.permission}
              rowActions={endButton}
              density="compact"
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
        isOpen={granting}
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
