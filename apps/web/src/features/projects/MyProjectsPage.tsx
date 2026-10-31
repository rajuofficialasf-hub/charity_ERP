import { formatDate } from '@css/shared/format';
import { type Locale, localized } from '@css/shared/i18n';
import { Badge, Button, Card, EmptyState, ErrorState, Skeleton, Text } from '@css/ui';
import { useQuery } from '@tanstack/react-query';
import { FolderKanban } from 'lucide-react';
import { useLocale, useTranslations } from 'use-intl';
import { AccountPage } from '../../components/AccountPage';
import { DocumentTitle } from '../../components/DocumentTitle';
import { ApiFailure } from '../../lib/api';
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
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;
  const list = useQuery({ queryKey: MY_PROJECTS_KEY, queryFn: projectsOf });
  if (list.isPending) return <Skeleton shape="card" />;
  if (list.error)
    return (
      <ErrorState
        title={tc('state.error.text')}
        requestId={list.error instanceof ApiFailure ? list.error.requestId : undefined}
        onRetry={() => void list.refetch()}
      />
    );
  if (list.data.length === 0)
    return <EmptyState icon={FolderKanban} title={t('empty')} headingLevel={2} />;
  const window = (p: MyProject) =>
    p.applyFrom && p.applyTo ? `${formatDate(p.applyFrom)} – ${formatDate(p.applyTo)}` : null;
  return (
    <ul className="my-projects" aria-label={t('list')}>
      {list.data.map((p) => (
        <li key={p.projectId}>
          <Card
            title={`${localized(p.name, locale)} (${p.code})`}
            headingLevel={2}
            actions={
              <Button
                variant={p.consentStatus === 'pending' ? 'primary' : 'secondary'}
                size="sm"
                href={`/my-projects/${p.projectId}`}
              >
                {p.consentStatus === 'pending' ? t('read_rules') : t('open_project')}
              </Button>
            }
          >
            <Badge
              tone={p.consentStatus === 'accepted' ? 'success' : 'warning'}
              label={p.consentStatus === 'accepted' ? t('accepted') : t('pending')}
            />
            {window(p) && <Text tone="muted">{window(p)}</Text>}
          </Card>
        </li>
      ))}
    </ul>
  );
}
