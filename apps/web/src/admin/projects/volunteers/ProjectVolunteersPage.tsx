import { type Locale, localized } from '@css/shared/i18n';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Skeleton,
  Switch,
  Table,
  type TableColumn,
  PageHeader,
} from '@css/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRightLeft, Pencil, UserMinus, UserPlus, Users } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useLocale, useTranslations } from 'use-intl';
import { DocumentTitle } from '../../../components/DocumentTitle';
import { ApiFailure } from '../../../lib/api';
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

const ASSIGN = 'volunteer.assign_project';

/**
 * The volunteers of a project (BR-037, BR-038; DECISION_LOG D-096): officials see the assignments
 * of their areas with the permission set, the paid flag and whether the volunteer accepted the
 * rules; the RPM (and an executive with the RPM's grant) assigns several at once, changes a set or
 * the paid flag and ends an assignment with a reason; the RPM grants an executive the right to
 * assign. The server decides every action by area.
 */
export function ProjectVolunteersPage() {
  const { me } = useAuth();
  const { projectId = '' } = useParams();
  const t = useTranslations('admin.projects.volunteers');
  const tc = useTranslations('common');
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
    <Badge
      tone={a.consentStatus === 'accepted' ? 'success' : 'warning'}
      label={t(`consent.${a.consentStatus}`)}
    />
  );
  const columns: TableColumn<Assignment>[] = [
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
        <Button
          variant="ghost"
          size="sm"
          icon={ArrowRightLeft}
          iconOnly
          href={`/admin/projects/${projectId}/transfer?from=${a.volunteerId}`}
        >
          {t('transfer', { name: a.displayName })}
        </Button>
      ) : null}
      <Button variant="ghost" size="sm" icon={Pencil} iconOnly onPress={() => setChanging(a)}>
        {t('change', { name: a.displayName })}
      </Button>
      <Button variant="ghost" size="sm" icon={UserMinus} iconOnly onPress={() => setEnding(a)}>
        {t('end', { name: a.displayName })}
      </Button>
    </span>
  );
  const execs = (executives.data ?? []).filter((s) => s.roleKey === 'project_executive');

  return (
    <>
      <DocumentTitle title={t('title', { name })} />
      <Link to={`/admin/projects/${projectId}`}>{t('back')}</Link>
      <PageHeader
        title={t('title', { name })}
        actions={
          assigns && (
            <Button icon={UserPlus} onPress={() => setAssigning(true)}>
              {t('assign')}
            </Button>
          )
        }
      />
      {notice && (
        <Alert tone="success" live="status" onDismiss={() => setNotice(undefined)}>
          {notice}
        </Alert>
      )}
      <Table
        label={t('table')}
        columns={columns}
        rows={list.data?.data ?? []}
        rowKey={(a) => a.id}
        rowLabel={(a) => a.displayName}
        loading={list.isPending}
        error={
          list.error ? (
            <ErrorState
              title={tc('state.error.text')}
              requestId={list.error instanceof ApiFailure ? list.error.requestId : undefined}
              onRetry={() => void list.refetch()}
            />
          ) : undefined
        }
        emptyState={<EmptyState icon={Users} title={t('empty')} headingLevel={2} />}
        rowActions={assigns ? actions : undefined}
        cardRenderer={(a) => (
          <div className="admin-permission-card">
            <strong>{a.displayName}</strong>
            <span>{t(`set.${a.permissionSet}`)}</span>
            {consent(a)}
            {assigns && actions(a)}
          </div>
        )}
      />
      {list.data?.next && (
        <Button variant="ghost" size="sm" onPress={() => setPages([...pages, list.data!.next])}>
          {t('dialog.more')}
        </Button>
      )}
      {grants && execs.length > 0 && (
        <Card title={t('grant.title')} headingLevel={2}>
          {execs.map((person) => (
            <Switch
              key={person.id}
              isSelected={person.extraPermissions.includes(ASSIGN)}
              onChange={(on) => setGranting({ person, on })}
            >
              {t('grant.label', { name: person.displayName })}
            </Switch>
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
