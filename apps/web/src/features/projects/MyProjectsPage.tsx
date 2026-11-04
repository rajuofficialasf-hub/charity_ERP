import { formatDate } from '@css/shared/format';
import { type Locale, localized } from '@css/shared/i18n';
import { Card, Chip, EmptyState, LinkButton, Skeleton, Text } from '@/ui';
import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'use-intl';
import { AccountPage } from '../../components/AccountPage';
import { DocumentTitle } from '../../components/DocumentTitle';
import { LoadError } from '../../components/LoadError';
import { orCached } from '../../lib/or-cached';
import { MY_PROJECTS_KEY, myProjects, type MyProject } from './my-projects-api';

/**
 * A volunteer's running projects (BR-039; DECISION_LOG D-096): each project waits for the consent
 * to its rules until the volunteer reads and accepts them, and opens for work after. Without
 * network the list comes from the phone's data set.
 */
export function MyProjectsPage() {
  const t = useTranslations('projects.mine');
  return (
    <AccountPage title={() => t('title')}>
      {() => (
        <>
          <DocumentTitle title={t('title')} />
          <ProjectList />
        </>
      )}
    </AccountPage>
  );
}

/** The server's list, or the phone's when the network is away. */
const projectsOf = () =>
  orCached(myProjects, async () => (await import('../../offline/snapshot')).cachedProjects());

function ProjectList() {
  const t = useTranslations('projects.mine');
  const locale = useLocale() as Locale;
  const list = useQuery({ queryKey: MY_PROJECTS_KEY, queryFn: projectsOf });
  if (list.isPending) return <Skeleton shape="card" />;
  if (list.error) return <LoadError error={list.error} onRetry={() => void list.refetch()} />;
  if (list.data.length === 0) return <EmptyState title={t('empty')} />;
  const window = (p: MyProject) =>
    p.applyFrom && p.applyTo ? `${formatDate(p.applyFrom)} – ${formatDate(p.applyTo)}` : null;
  return (
    <ul className="my-projects" aria-label={t('list')}>
      {list.data.map((p) => (
        <li key={p.projectId}>
          <Card
            title={`${localized(p.name, locale)} (${p.code})`}
            headingLevel={2}
            action={
              <LinkButton
                variant={p.consentStatus === 'pending' ? 'primary' : 'secondary'}
                to={`/my-projects/${p.projectId}`}
              >
                {p.consentStatus === 'pending' ? t('read_rules') : t('open_project')}
              </LinkButton>
            }
          >
            <Chip tone={p.consentStatus === 'accepted' ? 'success' : 'warning'}>
              {p.consentStatus === 'accepted' ? t('accepted') : t('pending')}
            </Chip>
            {window(p) && <Text tone="muted">{window(p)}</Text>}
          </Card>
        </li>
      ))}
    </ul>
  );
}
