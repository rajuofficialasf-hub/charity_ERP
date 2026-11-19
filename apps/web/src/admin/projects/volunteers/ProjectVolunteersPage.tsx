import { type Locale, localized } from '@css/shared/i18n';
import {
  Alert,
  Button,
  Card,
  Chip,
  DataTable,
  IconButton,
  Skeleton,
  Stack,
  Switch,
  type DataTableExtendedColumn,
} from '@/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useParams } from 'react-router';
import { useLocale, useTranslations } from 'use-intl';
import { DocumentTitle } from '../../../components/DocumentTitle';
import { useAuth } from '../../../lib/auth';
import { ForbiddenContent } from '../../AdminLayout';
import {
  canAssignVolunteers,
  canGrantOnProject,
  canMarkPaid,
  canSeeProjects,
  canTransferApplications,
} from '../../roles';
import { project as projectOf, PROJECTS_KEY } from '../projects-api';
import { ReasonDialog } from '../ReasonDialog';
import { staff, type StaffAccess, setupKey } from '../setup/setup-api';
import { AssignDialog } from './AssignDialog';
import { ChangeAssignmentDialog } from './ChangeAssignmentDialog';
import {
  type Assignment,
  assignments,
  endAssignment,
  setProjectGrants,
  volunteersKey,
} from './project-volunteers-api';
import { LoadError } from '../../../components/LoadError';

const ASSIGN = 'volunteer.assign_project';

/**
 * The volunteers of a project: officials see the assignments
 * of their areas with the permission set, the paid flag and whether the volunteer accepted the
 * rules; the RPM (and an executive with the RPM's grant) assigns several at once, changes a set or
 * the paid flag and ends an assignment with a reason; the RPM grants an executive the right to
 * assign. The server decides every action by area.
 */
export function ProjectVolunteersPage() {
  const { me } = useAuth();
  const { projectId = '' } = useParams();
  const t = useTranslations('admin.projects.volunteers');
  const locale = useLocale() as Locale;
  const queryClient = useQueryClient();
  const allowed = Boolean(me && canSeeProjects(me));
  const [assigning, setAssigning] = useState(false);
  const [changing, setChanging] = useState<Assignment | null>(null);
  const [ending, setEnding] = useState<Assignment | null>(null);
  const [granting, setGranting] = useState<{ person: StaffAccess; on: boolean } | null>(null);
  const [notice, setNotice] = useState<string>();
  const grants = Boolean(me && canGrantOnProject(me));
  const one = useQuery({
    queryKey: [...PROJECTS_KEY, 'one-plain', projectId],
    queryFn: () => projectOf(projectId),
    enabled: allowed,
  });
  // the pages read so far: "show more" follows the cursor of the last one
  const [pages, setPages] = useState<(string | null)[]>([null]);
  const list = useQuery({
    queryKey: [...volunteersKey(projectId), pages],
    queryFn: async () => {
      const data: Assignment[] = [];
      let next: string | null = null;
      for (const cursor of pages) {
        const page = await assignments(projectId, cursor);
        data.push(...page.data);
        next = page.meta.nextCursor;
      }
      return { data, next };
    },
    enabled: allowed,
  });
  const executives = useQuery({
    queryKey: setupKey(projectId, 'staff'),
    queryFn: () => staff(projectId),
    enabled: allowed && grants,
  });
  const end = useMutation({
    mutationFn: (reason: string) => endAssignment(ending!.id, reason),
    onSuccess: () => {
      setNotice(t('notice.ended', { name: ending!.displayName }));
      setEnding(null);
      void queryClient.invalidateQueries({ queryKey: volunteersKey(projectId) });
    },
  });
  const grant = useMutation({
    mutationFn: async (reason: string) => {
      const { person, on } = granting!;
      // the extras as they are now: the grant replaces the whole set
      const fresh = (await staff(projectId)).find((s) => s.id === person.id) ?? person;
      const others = fresh.extraPermissions.filter((p) => p !== ASSIGN);
      return setProjectGrants(projectId, {
        userId: person.userId,
        permissions: on ? [...others, ASSIGN] : others,
        reason,
      });
    },
    onSuccess: () => {
      setGranting(null);
      setNotice(t('notice.granted'));
      void queryClient.invalidateQueries({ queryKey: setupKey(projectId, 'staff') });
    },
  });
  if (!me) return null;
  if (!allowed) return <ForbiddenContent />;
  if (one.isPending) return <Skeleton shape="card" />;
  const name = one.data ? localized(one.data.name, locale) : '';
  const assigns = canAssignVolunteers(me);
  const paid = canMarkPaid(me);
  const refresh = () => void queryClient.invalidateQueries({ queryKey: volunteersKey(projectId) });

  const consent = (a: Assignment) => (
    <Chip tone={a.consentStatus === 'accepted' ? 'success' : 'warning'}>
      {t(`consent.${a.consentStatus}`)}
    </Chip>
  );
  const columns: DataTableExtendedColumn<Assignment>[] = [
    { id: 'name', header: t('column.name'), cell: (a) => a.displayName, isRowHeader: true },
    { id: 'type', header: t('column.type'), cell: (a) => t(`type.${a.type}`), priority: 2 },
    { id: 'set', header: t('column.set'), cell: (a) => t(`set.${a.permissionSet}`) },
    {
      id: 'paid',
      header: t('column.paid'),
      cell: (a) => (a.isPaid ? t('paid_yes') : t('paid_no')),
      priority: 2,
    },
    { id: 'consent', header: t('column.consent'), cell: consent },
  ];
  const transfers = canTransferApplications(me);
  const actions = (a: Assignment) => (
    <span>
      {transfers ? (
        <IconButton
          label={t('transfer', { name: a.displayName })}
          icon="transfer"

          to={`/admin/projects/${projectId}/transfer?from=${a.volunteerId}`}
        />
      ) : null}
      <IconButton
        label={t('change', { name: a.displayName })}
        icon="edit"
        onClick={() => setChanging(a)}
      />
      <IconButton
        label={t('end', { name: a.displayName })}
        icon="user-minus"
        onClick={() => setEnding(a)}
      />
    </span>
  );
  const execs = (executives.data ?? []).filter((s) => s.roleKey === 'project_executive');

  return (
    <>
      <DocumentTitle title={t('title', { name })} />
      {/* the session's frame names the project and draws the tabs; this names the tab's page */}
      <h2 className="app-sr-only">{t('title', { name })}</h2>
      {assigns && (
        <Stack direction="row" justify="end">
          <Button startIcon="user-add" onClick={() => setAssigning(true)}>
            {t('assign')}
          </Button>
        </Stack>
      )}
      {notice && (
        <Alert tone="success" onDismiss={() => setNotice(undefined)}>
          {notice}
        </Alert>
      )}
      <DataTable
        label={t('table')}
        columns={columns}
        rows={list.data?.data ?? []}
        getRowId={(a) => a.id}
        rowLabel={(a) => a.displayName}
        loading={list.isPending}
        error={
          list.error ? (
            <LoadError error={list.error} onRetry={() => void list.refetch()} />
          ) : undefined
        }
        emptyTitle={t('empty')}
        rowActions={assigns ? actions : undefined}
        cardRenderer={(a) => (
          <div className="admin-permission-card">
            <strong>{a.displayName}</strong>
            <span>{t(`set.${a.permissionSet}`)}</span>
            {consent(a)}
          </div>
        )}
      />
      {list.data?.next && (
        <Button variant="text" size="small" onClick={() => setPages([...pages, list.data!.next])}>
          {t('dialog.more')}
        </Button>
      )}
      {grants && execs.length > 0 && (
        <Card title={t('grant.title')} headingLevel={2}>
          {execs.map((person) => (
            <Switch
              label={t('grant.label', { name: person.displayName })}
              key={person.id}
              checked={person.extraPermissions.includes(ASSIGN)}
              onChange={(on) => setGranting({ person, on })}
            />
          ))}
        </Card>
      )}
      {assigning && (
        <AssignDialog
          projectId={projectId}
          markPaid={paid}
          onClose={() => setAssigning(false)}
          onDone={(assigned) => {
            setAssigning(false);
            setNotice(t('notice.assigned', { count: String(assigned.length) }));
            refresh();
          }}
        />
      )}
      {changing && (
        <ChangeAssignmentDialog
          assignment={changing}
          markPaid={paid}
          onClose={() => setChanging(null)}
          onDone={(changed) => {
            setChanging(null);
            setNotice(t('notice.changed', { name: changed.displayName }));
            refresh();
          }}
        />
      )}
      {ending && (
        <ReasonDialog
          title={t('end_title')}
          confirm={t('end_confirm')}
          danger
          pending={end.isPending}
          error={end.error}
          onConfirm={({ reason }) => end.mutate(reason)}
          onClose={() => {
            setEnding(null);
            end.reset();
          }}
        />
      )}
      {granting && (
        <ReasonDialog
          title={t('grant.reason_title')}
          confirm={t('grant.confirm')}
          pending={grant.isPending}
          error={grant.error}
          onConfirm={({ reason }) => grant.mutate(reason)}
          onClose={() => {
            setGranting(null);
            grant.reset();
          }}
        />
      )}
    </>
  );
}
