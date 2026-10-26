import { localized, type Locale } from '@css/shared/i18n';
import { Alert, ErrorState, Skeleton, Stepper, type StepMark } from '@css/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Rocket } from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { useLocale, useTranslations } from 'use-intl';
import { DocumentTitle } from '../../../components/DocumentTitle';
import { ApiFailure } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { ForbiddenContent } from '../../AdminLayout';
import { canCreateProjects, canSeeProjects } from '../../roles';
import { ProjectStatusBadge } from '../ProjectStatusBadge';
import { moveProject, type Project, PROJECTS_KEY } from '../projects-api';
import { AreasSection } from './AreasSection';
import { QuotasSection } from './QuotasSection';
import { BasicsSection } from './BasicsSection';
import { BudgetSection } from './BudgetSection';
import { ComponentsSection } from './ComponentsSection';
import { CreateStep } from './CreateStep';
import { ReviewStep } from './ReviewStep';
import { RulesSection } from './RulesSection';
import {
  areas,
  components,
  forms,
  fundSources,
  projectWithEtag,
  rules,
  setupKey,
  staff,
  syllabus,
  quotas,
} from './setup-api';
import { SetupProvider, StepSaveProvider } from './setup-context';
import { StaffSection } from './StaffSection';
import { SyllabusSection } from './SyllabusSection';
import { WindowSection } from './WindowSection';
import { WizardActions } from './WizardActions';
import {
  firstOpenStep,
  isStepId,
  marksFor,
  missingItems,
  STEP_IDS,
  type StepId,
} from './wizard-steps';

const PHONE = '(max-width: 639px)';

/** Whether the screen is phone-sized now (the setup is desktop-first). */
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
 * The parts of the step on screen hand their saves to the wizard (`useStepSave`); a move first
 * runs them in order and goes on only when each succeeded, so nothing typed is lost and a
 * refusal stays visible. A step may hold more than one part (the areas and their quotas).
 */
function useStepRunner() {
  const saves = useRef(new Set<() => Promise<boolean>>());
  const register = useCallback((next: () => Promise<boolean>) => {
    saves.current.add(next);
    return () => {
      saves.current.delete(next);
    };
  }, []);
  const [busy, setBusy] = useState(false);
  const run = async (then: () => void | Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      for (const save of saves.current) if (!(await save())) return;
      await then();
    } finally {
      setBusy(false);
    }
  };
  return { register, busy, run };
}

/**
 * The project setup as a wizard (SCR-060, UX-20): `/admin/projects/new` starts with the first
 * step, which creates the draft; `/admin/projects/:projectId/setup` walks the steps one at a time,
 * the current one kept in the address (`?step=`), a return opening the first step with something
 * missing. Back and Next save the step on screen; "save and exit" saves and opens the project; the
 * review step activates a complete draft.
 */
export function ProjectSetupPage() {
  const { me } = useAuth();
  const { projectId } = useParams();
  if (!me) return null;
  if (!canSeeProjects(me) || (!projectId && !canCreateProjects(me))) return <ForbiddenContent />;
  return projectId ? <ProjectWizard projectId={projectId} /> : <NewProjectWizard />;
}

/** The title, the step indicator and the step count of a wizard page. */
function WizardHead({
  title,
  badge,
  back,
  steps,
  current,
  marks,
  onSelect,
}: {
  title: string;
  badge?: ReactNode;
  back: ReactNode;
  steps: StepId[];
  current: number;
  marks?: StepMark[];
  onSelect?: (index: number) => void;
}) {
  const t = useTranslations('admin.projects.wizard');
  const ts = useTranslations('admin.projects.setup.section');
  return (
    <header className="admin-wizard-head">
      {back}
      <div className="admin-title-row">
        <h1 className="admin-title">{title}</h1>
        {badge}
      </div>
      <Stepper
        label={t('steps')}
        steps={steps.map((s) => ts(s))}
        current={current}
        marks={marks}
        missingLabel={t('missing_mark')}
        onSelect={onSelect}
      />
      <p className="admin-wizard-count">
        {t('step_of', { n: String(current + 1), total: String(steps.length) })}
      </p>
    </header>
  );
}

/** The first step of a new project, before it exists: Next creates the draft. */
function NewProjectWizard() {
  const t = useTranslations('admin.projects.wizard');
  const tp = useTranslations('admin.projects');
  const navigate = useNavigate();
  const { register, busy, run } = useStepRunner();
  // where the created draft opens: the next step, or the project after "save and exit"
  const exit = useRef(false);
  const steps = STEP_IDS.filter((s) => s !== 'syllabus');
  const created = (project: Project) =>
    void navigate(
      exit.current
        ? `/admin/projects/${project.id}`
        : `/admin/projects/${project.id}/setup?step=components`,
      exit.current ? { state: { notice: t('saved_notice') } } : { replace: true },
    );
  return (
    <div className="admin-wizard">
      <DocumentTitle title={t('new_title')} />
      <WizardHead
        title={t('new_title')}
        back={<Link to="/admin/projects">{tp('detail.back')}</Link>}
        steps={steps}
        current={0}
      />
      <StepSaveProvider value={register}>
        <CreateStep onCreated={created} />
      </StepSaveProvider>
      <WizardActions
        busy={busy}
        saveExitLabel={t('save_exit_draft')}
        onSaveExit={() => {
          exit.current = true;
          void run(() => undefined);
        }}
        primary={{
          label: t('next'),
          icon: ArrowRight,
          onPress: () => {
            exit.current = false;
            void run(() => undefined);
          },
        }}
      />
    </div>
  );
}

/** The setup of an existing project, one step at a time. */
function ProjectWizard({ projectId }: { projectId: string }) {
  const { me } = useAuth();
  const t = useTranslations('admin.projects.wizard');
  const ts = useTranslations('admin.projects.setup');
  const tp = useTranslations('admin.projects');
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const phone = usePhone();
  const configure = Boolean(me && canCreateProjects(me));
  const rpm = Boolean(me?.roles.includes('regional_program_manager'));
  const { register, busy, run } = useStepRunner();

  const one = useSetupPart(projectId, 'project', () => projectWithEtag(projectId), true);
  const parts = useSetupPart(projectId, 'components', () => components(projectId), true);
  const areaList = useSetupPart(projectId, 'areas', () => areas(projectId), true);
  const quotaList = useSetupPart(projectId, 'quotas', () => quotas(projectId), true);
  const staffList = useSetupPart(projectId, 'staff', () => staff(projectId), true);
  // fund sources are budget data, read only at program level
  const funds = useSetupPart(projectId, 'fund-sources', () => fundSources(projectId), configure);
  const dawah = parts.data?.some((c) => c.componentKey === 'dawah' && c.enabled) === true;
  const topics = useSetupPart(projectId, 'syllabus', () => syllabus(projectId), dawah);
  // every official of the project reads the rules; the step is read-only without setup rights
  const rulesText = useSetupPart(projectId, 'rules', () => rules(projectId), true);
  // activation needs a published form; the missing item opens the project's form in the builder,
  // or the forms page with the new-form dialog when the project has none
  const formList = useSetupPart(projectId, 'forms', () => forms(projectId), configure);
  const firstForm = formList.data?.find((f) => f.key === 'default') ?? formList.data?.[0];
  // the new-form dialog only for a project known to have no form; otherwise its forms page
  const formHref = firstForm
    ? `/admin/projects/${projectId}/forms/${firstForm.id}`
    : formList.data
      ? `/admin/projects/${projectId}/forms?new=1`
      : `/admin/projects/${projectId}/forms`;
  const activate = useMutation({
    mutationFn: () => moveProject(projectId, 'activate', one.data!.meta.etag),
    onSuccess: async () => {
      // the project page shows the new state, not the cached draft
      await queryClient.invalidateQueries({ queryKey: PROJECTS_KEY });
      await navigate(`/admin/projects/${projectId}`, { state: { notice: t('activated_notice') } });
    },
  });

  const loaded = one.data?.data;
  // the opening step needs the missing list, which reads the rules too
  const loading =
    one.isPending ||
    parts.isPending ||
    areaList.isPending ||
    rulesText.isPending ||
    (configure && (funds.isPending || formList.isPending));
  // the budget is a step of the PM and the global roles, also while its fund sources fail to load
  const steps: StepId[] = STEP_IDS.filter(
    (s) => (s !== 'budget' || configure) && (s !== 'syllabus' || dawah),
  );
  // the check reads every part: without one of them the marks and the missing list stay off
  const missing =
    configure &&
    loaded &&
    parts.data &&
    funds.data &&
    areaList.data &&
    rulesText.data &&
    formList.data
      ? missingItems(
          loaded,
          parts.data,
          funds.data,
          areaList.data,
          rulesText.data.rules,
          formList.data.some(
            (f) => f.publishedVersionId !== null && f.kind === 'beneficiary_application',
          ),
        )
      : null;
  const asked = params.get('step');
  const valid = isStepId(asked) && steps.includes(asked);
  const opening = configure ? firstOpenStep(steps, missing) : 'basics';
  // without a step in the address the opening step is written there once, so a save that
  // completes it never moves the user away from the step on screen
  useEffect(() => {
    if (!loading && !valid) setParams({ step: opening }, { replace: true });
  }, [loading, valid, opening, setParams]);

  const back = <Link to={`/admin/projects/${projectId}`}>{ts('back')}</Link>;
  if (loading) return <Skeleton shape="card" count={3} />;
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

  const step: StepId = valid ? asked : opening;
  const index = steps.indexOf(step);
  const go = (next: StepId) =>
    run(() => {
      activate.reset();
      setParams({ step: next });
      window.scrollTo?.({ top: 0 });
    });
  const editable = ['draft', 'active'].includes(project.status) && (configure || rpm);
  const locked = !['draft', 'active'].includes(project.status);
  const toProject = () =>
    navigate(`/admin/projects/${projectId}`, {
      state: editable ? { notice: t('saved_notice') } : null,
    });

  const body = new Map<StepId, ReactNode>([
    ['basics', <BasicsSection key="basics" />],
    [
      'components',
      failed(parts) ?? <ComponentsSection components={parts.data ?? []} formHref={formHref} />,
    ],
    ['budget', failed(funds) ?? (funds.data && <BudgetSection sources={funds.data} />)],
    ['window', <WindowSection key="window" />],
    [
      'areas',
      failed(areaList) ??
        (areaList.data && (
          <>
            <AreasSection areas={areaList.data} />
            {failed(quotaList) ??
              (quotaList.data && <QuotasSection quotas={quotaList.data} manage={configure} />)}
          </>
        )),
    ],
    [
      'staff',
      failed(staffList) ??
        (staffList.data && (
          <StaffSection
            staff={staffList.data}
            areas={areaList.data ?? []}
            manage={configure || rpm}
          />
        )),
    ],
    ['syllabus', failed(topics) ?? (topics.data && <SyllabusSection topics={topics.data} />)],
    ['rules', failed(rulesText) ?? (rulesText.data && <RulesSection current={rulesText.data} />)],
    [
      'review',
      <ReviewStep
        key="review"
        missing={missing}
        activation={activate.error}
        formHref={formHref}
        onOpen={(target) => void go(target)}
      />,
    ],
  ]);
  const last = index === steps.length - 1;
  const primary = !last
    ? { label: t('next'), icon: ArrowRight, onPress: () => void go(steps.at(index + 1)!) }
    : // a draft is activated only when what it still needs is known
      project.status === 'draft' && configure && missing !== null
      ? { label: t('activate'), icon: Rocket, onPress: () => activate.mutate() }
      : { label: t('to_project'), icon: ArrowRight, onPress: () => void toProject() };

  return (
    <SetupProvider value={{ project, etag: meta.etag, phone, configure, refresh }}>
      <div className="admin-wizard">
        <DocumentTitle title={ts('title', { name: localized(project.name, locale) })} />
        <WizardHead
          title={ts('title', { name: localized(project.name, locale) })}
          badge={<ProjectStatusBadge status={project.status} />}
          back={back}
          steps={steps}
          current={index}
          marks={marksFor(steps, missing)}
          onSelect={(i) => void go(steps.at(i)!)}
        />
        {locked && (
          <Alert tone="info" live="status">
            {ts('read_only', { status: tp(`status.${project.status}`) })}
          </Alert>
        )}
        {phone && !locked && <Alert tone="info">{ts('phone_limits')}</Alert>}
        <StepSaveProvider value={register}>
          <div className="admin-wizard-step">{body.get(step)}</div>
        </StepSaveProvider>
        <WizardActions
          busy={busy || activate.isPending}
          onBack={index > 0 ? () => void go(steps.at(index - 1)!) : undefined}
          saveExitLabel={project.status === 'draft' ? t('save_exit_draft') : t('save_exit')}
          onSaveExit={editable ? () => void run(toProject) : undefined}
          primary={primary}
        />
      </div>
    </SetupProvider>
  );
}
