import { formatCount, formatDate } from '@css/shared/format';
import { type Locale, localized } from '@css/shared/i18n';
import { Alert, Button, Card, Checkbox, LinkButton, Skeleton, Stack, Stepper } from '@/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useLocale, useTranslations } from 'use-intl';
import { AccountPage } from '../../components/AccountPage';
import { DocumentTitle } from '../../components/DocumentTitle';
import { LoadError } from '../../components/LoadError';
import { ApiFailure } from '../../lib/api';
import { orCached } from '../../lib/or-cached';
import { loadStore } from '../applications/use-local-records';
import { consent, MY_PROJECTS_KEY, myProject, type MyProjectDetail } from './my-projects-api';
import './projects.css';

const detailKey = (projectId: string) => [...MY_PROJECTS_KEY, projectId] as const;

/**
 * One of the volunteer's projects. While the consent waits, the rules are read part by part (the
 * Local দায়ী part only while dawah is on), each confirmed, then the final "আমি রাজি এবং এই
 * প্রকল্পে কাজ করতে আগ্রহী"; refusing keeps the project waiting (BR-039, DECISION_LOG D-096).
 * After the consent the project's work facts show, with the team for a main volunteer. Without
 * network the phone's copy of the project opens; the rules themselves are read online only, so a
 * consent still waiting says it needs the connection.
 */
export function MyProjectPage() {
  const t = useTranslations('projects.mine');
  return <AccountPage title={() => t('title')}>{() => <ProjectView />}</AccountPage>;
}

function ProjectView() {
  const { projectId = '' } = useParams();
  const t = useTranslations('projects');
  const locale = useLocale() as Locale;
  const one = useQuery({
    queryKey: detailKey(projectId),
    queryFn: () =>
      orCached(
        () => myProject(projectId),
        async () => (await loadStore()).cachedProject(projectId),
      ),
  });
  const back = <Link to="/my-projects">{t('mine.back')}</Link>;
  if (one.isPending) return <Skeleton shape="card" />;
  if (one.error)
    return (
      <>
        {back}
        {/* a draft, a closed project or an ended assignment is not the volunteer's to see */}
        {one.error instanceof ApiFailure && one.error.status === 404 ? (
          <p>{t('mine.not_found')}</p>
        ) : (
          <LoadError error={one.error} onRetry={() => void one.refetch()} />
        )}
      </>
    );
  const p = one.data;
  return (
    <>
      <DocumentTitle title={localized(p.name, locale)} />
      {back}
      {p.consentStatus === 'pending' && p.rules.parts.length === 0 ? (
        // the phone's copy carries no rules: the consent waits for the network
        <Alert tone="info">{t('mine.consent_needs_network')}</Alert>
      ) : p.consentStatus === 'pending' ? (
        <ConsentFlow key={p.rulesVersion} project={p} />
      ) : (
        <ProjectFacts project={p} />
      )}
    </>
  );
}

function ProjectFacts({ project: p }: { project: MyProjectDetail }) {
  const t = useTranslations('projects.detail');
  const ts = useTranslations('admin.projects.volunteers.set');
  const tm = useTranslations('projects.mine');
  const locale = useLocale() as Locale;
  const none = t('none');
  const applications =
    p.applicationsLeft === null
      ? t('applications_counted', { counted: formatCount(p.applicationsCounted, locale) })
      : t('applications_value', {
          counted: formatCount(p.applicationsCounted, locale),
          left: formatCount(p.applicationsLeft, locale),
        });
  const facts: [string, string][] = [
    [
      t('window'),
      p.applyFrom && p.applyTo ? `${formatDate(p.applyFrom)} – ${formatDate(p.applyTo)}` : none,
    ],
    [t('limit'), p.perVolunteerLimit === null ? none : formatCount(p.perVolunteerLimit, locale)],
    [t('applications'), applications],
    ...(p.permissionSet ? [[t('set'), ts(p.permissionSet)] as [string, string]] : []),
  ];
  const leads = p.leadsTeam;
  return (
    <Card
      title={`${localized(p.name, locale)} (${p.code})`}
      headingLevel={2}
      action={
        <Stack direction="row" gap={2} wrap>
          {p.status === 'active' ? (
            <LinkButton variant="primary" to={`/my-projects/${p.projectId}/apply`}>
              {t('new_application')}
            </LinkButton>
          ) : null}
          <LinkButton variant="secondary" to="/my-applications?tab=pending">
            {t('my_applications')}
          </LinkButton>
          {leads ? (
            <LinkButton variant="secondary" to={`/my-projects/${p.projectId}/team`}>
              {t('team')}
            </LinkButton>
          ) : null}
        </Stack>
      }
    >
      <p>{tm('accepted')}</p>
      <dl className="my-project-facts">
        {facts.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

function ConsentFlow({ project: p }: { project: MyProjectDetail }) {
  const t = useTranslations('projects.consent');
  const tp = useTranslations('admin.projects.rules_part');
  const locale = useLocale() as Locale;
  const queryClient = useQueryClient();
  const parts = p.rules.parts;
  const [step, setStep] = useState(0);
  const [read, setRead] = useState<boolean[]>(parts.map(() => false));
  const [agree, setAgree] = useState(false);
  const [refused, setRefused] = useState(false);
  const last = step === parts.length;
  const answer = useMutation({
    mutationFn: (decision: 'accepted' | 'refused') =>
      consent(p.projectId, {
        rulesVersion: p.rules.version,
        decision,
        parts: decision === 'accepted' ? parts.map((x) => x.part) : [],
      }),
    onSuccess: async (_, decision) => {
      if (decision === 'refused') setRefused(true);
      await queryClient.invalidateQueries({ queryKey: MY_PROJECTS_KEY });
    },
    onError: async (error) => {
      // the rules changed meanwhile: the new version is read from the start
      if (error instanceof ApiFailure && error.code === 'project.rules_changed')
        await queryClient.invalidateQueries({ queryKey: detailKey(p.projectId) });
    },
  });
  const changed =
    answer.error instanceof ApiFailure && answer.error.code === 'project.rules_changed';
  const labels = [...parts.map((x) => tp(x.part)), t('final')];
  return (
    <section className="my-consent" aria-labelledby="consent-title">
      <h2 id="consent-title">{t('title', { name: localized(p.name, locale) })}</h2>
      <Stepper label={t('steps')} steps={labels} current={step} />
      {refused && <Alert tone="info">{t('refused')}</Alert>}
      {changed && <Alert tone="warning">{t('changed')}</Alert>}
      {answer.error instanceof ApiFailure && !changed && (
        <Alert tone="error">{answer.error.message}</Alert>
      )}
      {!last ? (
        <Card title={labels[step]!} headingLevel={2}>
          <p className="my-consent-text">{localized(parts[step]!.text, locale)}</p>
          <Checkbox
            label={t('read')}
            checked={read[step] ?? false}
            onChange={(on) => setRead(read.map((r, i) => (i === step ? on : r)))}
          />
        </Card>
      ) : (
        <Card title={t('final')} headingLevel={2}>
          <Checkbox label={t('agree')} checked={agree} onChange={setAgree} />
        </Card>
      )}
      <div className="my-consent-actions">
        {step > 0 && (
          <Button variant="secondary" onClick={() => setStep(step - 1)}>
            {t('back')}
          </Button>
        )}
        <Button
          variant="text"
          onClick={() => answer.mutate('refused')}
          // one answer at a time: a second tap never sends the opposite decision
          disabled={answer.isPending}
          loading={answer.isPending && answer.variables === 'refused'}
        >
          {t('refuse')}
        </Button>
        {!last ? (
          <Button onClick={() => setStep(step + 1)} disabled={!read[step]}>
            {t('next')}
          </Button>
        ) : (
          <Button
            onClick={() => answer.mutate('accepted')}
            disabled={answer.isPending || !agree || read.some((r) => !r)}
            loading={answer.isPending && answer.variables === 'accepted'}
          >
            {t('accept')}
          </Button>
        )}
      </div>
    </section>
  );
}
