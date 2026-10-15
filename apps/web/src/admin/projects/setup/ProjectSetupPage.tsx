import { localized, type Locale } from '@css/shared/i18n';
import { Alert, ErrorState, Skeleton } from '@css/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useLocale, useTranslations } from 'use-intl';
import { DocumentTitle } from '../../../components/DocumentTitle';
import { ApiFailure } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { ForbiddenContent } from '../../AdminLayout';
import { canCreateProjects, canSeeProjects } from '../../roles';
import { ProjectStatusBadge } from '../ProjectStatusBadge';
import { PROJECTS_KEY } from '../projects-api';
import { AreasSection } from './AreasSection';
import { BasicsSection } from './BasicsSection';
import { BudgetSection } from './BudgetSection';
import { ComponentsSection } from './ComponentsSection';
import { SetupSummary } from './SetupSummary';
import {
  areas,
  components,
  fundSources,
  projectWithEtag,
  setupKey,
  staff,
  syllabus,
} from './setup-api';
import { SetupProvider } from './setup-context';
import { StaffSection } from './StaffSection';
import { SyllabusSection } from './SyllabusSection';
import { WindowSection } from './WindowSection';

const PHONE = '(max-width: 639px)';

type SectionId = 'basics' | 'components' | 'budget' | 'window' | 'areas' | 'staff' | 'syllabus';

/** Whether the screen is phone-sized now (the setup is desktop-first, SCR-060). */
function usePhone() {
  const [phone, setPhone] = useState(() => window.matchMedia?.(PHONE).matches === true);
  useEffect(() => {
    const query = window.matchMedia?.(PHONE);
    if (!query) return;
    const update = () => setPhone(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return phone;
}

/** One setup part of the project, loaded from its own route. */
function useSetupPart<T>(projectId: string, name: string, fn: () => Promise<T>, enabled: boolean) {
  return useQuery({ queryKey: setupKey(projectId, name), queryFn: fn, enabled, retry: false });
}

/**
 * The project setup (SCR-060, mockup 12): the section index, the sections, each loaded from its
 * own route and saved on its own, and the summary of what activation still needs. The state of the
 * project decides what may change; closing, closed and cancelled projects are read-only.
 */
export function ProjectSetupPage() {
  const { me } = useAuth();
  const { projectId = '' } = useParams();
  const t = useTranslations('admin.projects.setup');
  const tp = useTranslations('admin.projects');
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;
  const queryClient = useQueryClient();
  const phone = usePhone();
  const allowed = Boolean(me && canSeeProjects(me));
  const configure = Boolean(me && canCreateProjects(me));
  const rpm = Boolean(me?.roles.includes('regional_program_manager'));
  const one = useSetupPart(projectId, 'project', () => projectWithEtag(projectId), allowed);
  const parts = useSetupPart(projectId, 'components', () => components(projectId), allowed);
  const areaList = useSetupPart(projectId, 'areas', () => areas(projectId), allowed);
  const staffList = useSetupPart(projectId, 'staff', () => staff(projectId), allowed);
  // fund sources are budget data, read only at program level
  const funds = useSetupPart(
    projectId,
    'fund-sources',
    () => fundSources(projectId),
    allowed && configure,
  );
  const dawah = parts.data?.some((c) => c.componentKey === 'dawah' && c.enabled) === true;
  const topics = useSetupPart(projectId, 'syllabus', () => syllabus(projectId), allowed && dawah);

  if (!me) return null;
  if (!allowed) return <ForbiddenContent />;
  const back = <Link to={`/admin/projects/${projectId}`}>{t('back')}</Link>;
  if (one.isPending || parts.isPending) return <Skeleton shape="card" count={3} />;
  if (one.error)
    return (
      <>
        {back}
        {one.error instanceof ApiFailure && one.error.status === 404 ? (
          <p>{tp('detail.not_found')}</p>
        ) : (
          <ErrorState
            title={tc('state.error.text')}
            requestId={one.error instanceof ApiFailure ? one.error.requestId : undefined}
            onRetry={() => void one.refetch()}
          />
        )}
      </>
    );
  const { data: project, meta } = one.data;
  const refresh = () => queryClient.invalidateQueries({ queryKey: PROJECTS_KEY });
  // a part that did not load is an error with a retry, never "nothing configured"
  const failed = (query: { error: Error | null; refetch: () => unknown }) =>
    query.error ? (
      <ErrorState
        title={tc('state.error.text')}
        requestId={query.error instanceof ApiFailure ? query.error.requestId : undefined}
        onRetry={() => void query.refetch()}
      />
    ) : null;
  const locked = !['draft', 'active'].includes(project.status);
  const index: SectionId[] = [
    'basics',
    'components',
    ...(funds.data ? (['budget'] as const) : []),
    'window',
    'areas',
    'staff',
    ...(dawah ? (['syllabus'] as const) : []),
  ];

  return (
    <SetupProvider value={{ project, etag: meta.etag, phone, configure, refresh }}>
      <DocumentTitle title={t('title', { name: localized(project.name, locale) })} />
      {back}
      <div className="admin-title-row">
        <h1 className="admin-title">{t('title', { name: localized(project.name, locale) })}</h1>
        <ProjectStatusBadge status={project.status} />
      </div>
      {locked && (
        <Alert tone="info" live="status">
          {t('read_only', { status: tp(`status.${project.status}`) })}
        </Alert>
      )}
      {phone && !locked && <Alert tone="info">{t('phone_limits')}</Alert>}
      <div className="admin-setup">
        <nav className="admin-setup-index" aria-label={t('index')}>
          <ol>
            {index.map((id) => (
              <li key={id}>
                <a href={`#${id}`}>{t(`section.${id}`)}</a>
              </li>
            ))}
          </ol>
        </nav>
        <div className="admin-setup-main">
          <BasicsSection />
          {failed(parts) ?? <ComponentsSection components={parts.data ?? []} />}
          {failed(funds) ?? (funds.data && <BudgetSection sources={funds.data} />)}
          <WindowSection />
          {failed(areaList) ?? (areaList.data && <AreasSection areas={areaList.data} />)}
          {failed(staffList) ??
            (staffList.data && (
              <StaffSection
                staff={staffList.data}
                areas={areaList.data ?? []}
                manage={configure || rpm}
              />
            ))}
          {dawah && (failed(topics) ?? (topics.data && <SyllabusSection topics={topics.data} />))}
        </div>
        {/* the summary waits for every part it checks, so it never lists a part that failed */}
        {configure && parts.data && funds.data && areaList.data && (
          <SetupSummary components={parts.data} fundSources={funds.data} areas={areaList.data} />
        )}
      </div>
    </SetupProvider>
  );
}
