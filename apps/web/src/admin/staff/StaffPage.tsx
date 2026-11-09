import { type Affiliation, AFFILIATIONS, type InvitationIssued } from '@css/shared/auth';
import { type Locale, localized } from '@css/shared/i18n';
import {
  Alert,
  Button,
  Chip,
  DataTable,
  FilterBar,
  IconButton,
  Page,
  SelectField,
  Tabs,
  type ColorTone,
  type DataTableExtendedColumn,
  type ExtendedIconName,
} from '@/ui';
import { PersonAvatar } from '../../components/PersonPhoto';
import { keepPreviousData, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useLocale, useTranslations } from 'use-intl';
import { DocumentTitle } from '../../components/DocumentTitle';
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
import { LoadError } from '../../components/LoadError';

const ALL = 'all';

/** The icon of each affiliation's count card. */
const AFFILIATION_LOOK: Record<Affiliation, { icon: ExtendedIconName; tone: ColorTone }> = {
  department: { icon: 'users', tone: 'primary' },
  foundation: { icon: 'building', tone: 'info' },
  external: { icon: 'handshake', tone: 'warning' },
};

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
      <Page
        eyebrow={t('eyebrow')}
        title={t('title')}
        description={t('description')}
        actions={
          <>
            <StaffViewSwitch value="list" />
            {manage && (
              <Button startIcon="user-add" onClick={() => setCreating(true)}>
                {t('new')}
              </Button>
            )}
          </>
        }
        documentTitle={false}
      />
      <StatisticsBar
        label={t('stats.label')}
        loading={counts.some((c) => c.isPending)}
        // a count that could not be read is left out, never shown as zero
        items={AFFILIATIONS.flatMap((a, i) => {
          const count = counts.at(i);
          return count?.error ? [] : [{ a, value: count?.data ?? 0 }];
        }).map(({ a, value }) => ({
          key: a,
          label: t(`tabs.${a}`),
          value,
          // eslint-disable-next-line security/detect-object-injection -- an affiliation of a constant table
          ...AFFILIATION_LOOK[a],
        }))}
      />
      {notice && (
        <Alert tone="success" onDismiss={() => setNotice(undefined)}>
          {notice}
        </Alert>
      )}
      <Tabs
        label={t('tabs.label')}
        value={tab}
        onChange={(id) => setParams(id === 'department' ? {} : { tab: id }, { replace: true })}
        items={AFFILIATIONS.map((a) => ({ value: a, label: t(`tabs.${a}`), content: list(a) }))}
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
      <PersonAvatar name={u.displayName} fileId={u.photoFileId} size="sm" />
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
          <Chip key={r}>{roleName(r)}</Chip>
        ))}
      </span>
    </span>
  );
  const place = (u: StaffMember) =>
    (affiliation === 'department' ? programName(u.homeProgramId) : u.affiliationUnit) || '—';
  const state = (u: StaffMember) =>
    u.awaitingPassword ? (
      <Chip tone="warning">{t('state.awaiting')}</Chip>
    ) : u.state === 'active' ? (
      <Chip tone="success">{t('state.active')}</Chip>
    ) : (
      <Chip>{t(`state.${u.state}`)}</Chip>
    );
  const actions = (u: StaffMember) => (
    <span>
      <IconButton
        label={t('edit', { name: u.displayName })}
        icon="edit"
        onClick={() => onEdit(u)}
      />
      {u.awaitingPassword && (
        <IconButton
          label={t('renew_link', { name: u.displayName })}
          icon="link"
          onClick={() => onRenew(u)}
        />
      )}
    </span>
  );
  const columns: DataTableExtendedColumn<StaffMember>[] = [
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
      <DataTable
        label={t(`tabs.${affiliation}`)}
        toolbar={
          <FilterBar
            onSearch={onSearch}
            searchPlaceholder={t('filter.search')}
            onClearFilters={() =>
              filter(() => {
                setProgramId(ALL);
                setRole(ALL);
              })
            }
          >
            <>
              <SelectField
                label={t('filter.program')}
                value={programId}
                onChange={(id) => filter(() => setProgramId(id || ALL))}
                options={[
                  { value: ALL, label: t('filter.all') },
                  ...(programList.data ?? []).map((p) => ({
                    value: p.id,
                    label: localized(p.name, locale),
                  })),
                ]}
              />
              <SelectField
                label={t('filter.role')}
                value={role}
                onChange={(id) => filter(() => setRole(id || ALL))}
                options={[
                  { value: ALL, label: t('filter.all') },
                  ...(roleList.data ?? [])
                    .filter((r) => r.kind === 'official')
                    .map((r) => ({ value: r.key, label: localized(r.name, locale) })),
                ]}
              />
            </>
          </FilterBar>
        }
        columns={columns}
        rows={list.data?.data ?? []}
        getRowId={(u) => u.id}
        rowLabel={(u) => u.displayName}
        loading={list.isPending}
        error={
          list.error ? (
            <LoadError error={list.error} onRetry={() => void list.refetch()} />
          ) : undefined
        }
        emptyTitle={t('empty')}
        rowActions={manage ? actions : undefined}
        cardRenderer={(u) => (
          <div className="staff-card">
            <div className="staff-card-head">
              {person(u)}
              {state(u)}
            </div>
            {work(u)}
            {place(u) !== '—' && <span className="admin-muted">{place(u)}</span>}
          </div>
        )}
      />
      {list.data?.next && (
        <div>
          <Button
            variant="secondary"
            size="small"
            onClick={() => setPages([...pages, list.data!.next])}
          >
            {t('more')}
          </Button>
        </div>
      )}
    </>
  );
}
