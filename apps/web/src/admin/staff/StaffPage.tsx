import { type Affiliation, AFFILIATIONS, type InvitationIssued } from '@css/shared/auth';
import { type Locale, localized } from '@css/shared/i18n';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Select,
  Table,
  type TableColumn,
  TableToolbar,
  Tabs,
} from '@css/ui';
import { keepPreviousData, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleCheck, Clock, IdCard, Link2, Pencil, UserPlus } from 'lucide-react';
import { useCallback, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useLocale, useTranslations } from 'use-intl';
import { DocumentTitle } from '../../components/DocumentTitle';
import { ApiFailure } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { ForbiddenContent } from '../AdminLayout';
import { PROGRAMS_KEY, programs } from '../programs/programs-api';
import { roles } from '../registrations/registrations-api';
import { canManageOfficials, canSeeStaff } from '../roles';
import { StatisticsBar } from '../StatisticsBar';
import { LinkDialog } from './LinkDialog';
import { OfficialDialog } from './OfficialDialog';
import { RenewLinkDialog } from './RenewLinkDialog';
import { STAFF_KEY, type StaffMember, staffCount, staffPage } from './staff-api';
import { StaffViewSwitch } from './StaffViewSwitch';
import './staff.css';

const ALL = 'all';

/**
 * The officials (DECISION_LOG D-097, SCR-063): the counts by affiliation, then the department's
 * own staff, the officials from other departments of the Foundation and the outside partners,
 * each in its own tab with filters by program and role and a search by name, job ID, email or
 * mobile. The Department Head and the Monitoring Team create an official, edit a profile and send
 * a new set-password link; the server decides every list and every write. The switch beside the
 * title opens the organogram.
 */
export function StaffPage() {
  const { me } = useAuth();
  const t = useTranslations('admin.staff');
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const tab = (AFFILIATIONS as readonly string[]).includes(params.get('tab') ?? '')
    ? (params.get('tab') as Affiliation)
    : 'department';
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<StaffMember | null>(null);
  const [renewing, setRenewing] = useState<StaffMember | null>(null);
  const [link, setLink] = useState<{ name: string; issued: InvitationIssued } | null>(null);
  const [notice, setNotice] = useState<string>();
  const allowed = Boolean(me && canSeeStaff(me));
  const counts = useQueries({
    queries: AFFILIATIONS.map((a) => ({
      queryKey: [...STAFF_KEY, 'count', a],
      queryFn: () => staffCount(a),
      enabled: allowed,
    })),
  });
  if (!me) return null;
  if (!allowed) return <ForbiddenContent />;
  const manage = canManageOfficials(me);
  const refresh = () => void queryClient.invalidateQueries({ queryKey: STAFF_KEY });
  const list = (affiliation: Affiliation) => (
    <StaffList
      affiliation={affiliation}
      manage={manage}
      onEdit={setEditing}
      onRenew={setRenewing}
    />
  );

  return (
    <>
      <DocumentTitle title={t('title')} />
      <div className="admin-title-row">
        <h1 className="admin-title">{t('title')}</h1>
        <div className="admin-title-actions">
          <StaffViewSwitch value="list" />
          {manage && (
            <Button icon={UserPlus} onPress={() => setCreating(true)}>
              {t('new')}
            </Button>
          )}
        </div>
      </div>
      <StatisticsBar
        label={t('stats.label')}
        loading={counts.some((c) => c.isPending)}
        items={AFFILIATIONS.map((a, i) => ({
          key: a,
          label: t(`tabs.${a}`),
          value: counts.at(i)?.data ?? 0,
        }))}
      />
      {notice && (
        <Alert tone="success" live="status" onDismiss={() => setNotice(undefined)}>
          {notice}
        </Alert>
      )}
      <Tabs
        label={t('tabs.label')}
        selectedId={tab}
        onChange={(id) => setParams(id === 'department' ? {} : { tab: id }, { replace: true })}
        items={AFFILIATIONS.map((a) => ({ id: a, label: t(`tabs.${a}`), content: list(a) }))}
      />
      {creating && (
        <OfficialDialog
          onClose={() => setCreating(false)}
          onCreated={(name, issued) => {
            setCreating(false);
            setLink({ name, issued });
            refresh();
          }}
        />
      )}
      {editing && (
        <OfficialDialog
          official={editing}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            setEditing(null);
            setNotice(t('notice.saved', { name: saved.displayName }));
            refresh();
          }}
        />
      )}
      {renewing && (
        <RenewLinkDialog
          official={renewing}
          onClose={() => setRenewing(null)}
          onDone={(issued) => {
            setRenewing(null);
            setLink({ name: renewing.displayName, issued });
            refresh();
          }}
        />
      )}
      {link && <LinkDialog name={link.name} issued={link.issued} onClose={() => setLink(null)} />}
    </>
  );
}

/** One tab: the officials of an affiliation, read page by page with the filters of the tab. */
function StaffList({
  affiliation,
  manage,
  onEdit,
  onRenew,
}: {
  affiliation: Affiliation;
  manage: boolean;
  onEdit: (official: StaffMember) => void;
  onRenew: (official: StaffMember) => void;
}) {
  const t = useTranslations('admin.staff');
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;
  const [programId, setProgramId] = useState<string>(ALL);
  const [role, setRole] = useState<string>(ALL);
  const [q, setQ] = useState('');
  // the pages read so far: "show more" follows the cursor of the last one
  const [pages, setPages] = useState<(string | null)[]>([null]);
  const filters = {
    affiliation,
    programId: programId === ALL ? null : programId,
    role: role === ALL ? null : role,
    q: q.trim().length >= 2 ? q.trim() : '',
  };
  const list = useQuery({
    queryKey: [...STAFF_KEY, filters, pages],
    queryFn: async () => {
      const data: StaffMember[] = [];
      let next: string | null = null;
      for (const cursor of pages) {
        const page = await staffPage({ ...filters, cursor });
        data.push(...page.data);
        next = page.meta.nextCursor;
      }
      return { data, next };
    },
    // the rows read so far stay on screen while the next page or a new filter loads
    placeholderData: keepPreviousData,
  });
  const programList = useQuery({ queryKey: PROGRAMS_KEY, queryFn: programs });
  const roleList = useQuery({ queryKey: ['admin', 'roles'], queryFn: roles });
  const roleName = (key: string) => {
    const role = roleList.data?.find((r) => r.key === key);
    return role ? localized(role.name, locale) : key;
  };
  const programName = (id: string | null) => {
    const p = id ? programList.data?.find((x) => x.id === id) : undefined;
    return p ? localized(p.name, locale) : '';
  };
  const filter = (apply: () => void) => {
    apply();
    setPages([null]);
  };
  // stable across renders: the toolbar calls it 300 ms after typing stops
  const onSearch = useCallback((term: string) => {
    setQ(term);
    setPages([null]);
  }, []);

  const person = (u: StaffMember) => (
    <span className="staff-person">
      <Avatar name={u.displayName} size="sm" />
      <span className="staff-person-text">
        <Link to={`/admin/staff/${u.id}`} className="admin-person-name">
          {u.displayName}
        </Link>
        {u.jobId ? (
          <span className="staff-job" lang="en">
            {u.jobId}
          </span>
        ) : (
          <span className="staff-job staff-job-missing">{t('no_job_id')}</span>
        )}
      </span>
    </span>
  );
  const work = (u: StaffMember) => (
    <span className="staff-work">
      <span>{u.designation ?? ''}</span>
      <span className="admin-badges">
        {u.roles.map((r) => (
          <Badge key={r} size="sm" label={roleName(r)} />
        ))}
      </span>
    </span>
  );
  const place = (u: StaffMember) =>
    (affiliation === 'department' ? programName(u.homeProgramId) : u.affiliationUnit) || '—';
  const state = (u: StaffMember) =>
    u.awaitingPassword ? (
      <Badge tone="warning" icon={Clock} label={t('state.awaiting')} />
    ) : u.state === 'active' ? (
      <Badge tone="success" icon={CircleCheck} label={t('state.active')} />
    ) : (
      <Badge label={t(`state.${u.state}`)} />
    );
  const actions = (u: StaffMember) => (
    <span>
      <Button variant="ghost" size="sm" icon={Pencil} iconOnly onPress={() => onEdit(u)}>
        {t('edit', { name: u.displayName })}
      </Button>
      {u.awaitingPassword && (
        <Button variant="ghost" size="sm" icon={Link2} iconOnly onPress={() => onRenew(u)}>
          {t('renew_link', { name: u.displayName })}
        </Button>
      )}
    </span>
  );
  const columns: TableColumn<StaffMember>[] = [
    { id: 'name', header: t('column.name'), cell: person, isRowHeader: true },
    { id: 'designation', header: t('column.designation'), cell: work },
    {
      id: 'place',
      header: affiliation === 'department' ? t('column.program') : t('column.unit'),
      cell: place,
      priority: 2,
    },
    { id: 'state', header: t('column.state'), cell: state },
  ];

  return (
    <>
      <Table
        label={t(`tabs.${affiliation}`)}
        toolbar={
          <TableToolbar
            onSearch={onSearch}
            searchPlaceholder={t('filter.search')}
            activeFilterCount={(programId === ALL ? 0 : 1) + (role === ALL ? 0 : 1)}
            onClearFilters={() =>
              filter(() => {
                setProgramId(ALL);
                setRole(ALL);
              })
            }
            filters={
              <>
                <Select
                  label={t('filter.program')}
                  value={programId}
                  onChange={(id) => filter(() => setProgramId(id ?? ALL))}
                  options={[
                    { id: ALL, label: t('filter.all') },
                    ...(programList.data ?? []).map((p) => ({
                      id: p.id,
                      label: localized(p.name, locale),
                    })),
                  ]}
                />
                <Select
                  label={t('filter.role')}
                  value={role}
                  onChange={(id) => filter(() => setRole(id ?? ALL))}
                  options={[
                    { id: ALL, label: t('filter.all') },
                    ...(roleList.data ?? [])
                      .filter((r) => r.kind === 'official')
                      .map((r) => ({ id: r.key, label: localized(r.name, locale) })),
                  ]}
                />
              </>
            }
          />
        }
        columns={columns}
        rows={list.data?.data ?? []}
        rowKey={(u) => u.id}
        rowLabel={(u) => u.displayName}
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
        emptyState={<EmptyState icon={IdCard} title={t('empty')} headingLevel={2} />}
        rowActions={manage ? actions : undefined}
        cardRenderer={(u) => (
          <div className="staff-card">
            <div className="staff-card-head">
              {person(u)}
              {state(u)}
            </div>
            {work(u)}
            {place(u) !== '—' && <span className="admin-muted">{place(u)}</span>}
            {manage && actions(u)}
          </div>
        )}
      />
      {list.data?.next && (
        <div>
          <Button
            variant="secondary"
            size="sm"
            onPress={() => setPages([...pages, list.data!.next])}
          >
            {t('more')}
          </Button>
        </div>
      )}
    </>
  );
}
