import { Alert, Badge, Button, Card, Checkbox, EmptyState, ErrorState, Skeleton } from '@css/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { UserMinus, Users } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useTranslations } from 'use-intl';
import { AccountPage } from '../../components/AccountPage';
import { DocumentTitle } from '../../components/DocumentTitle';
import { ApiFailure } from '../../lib/api';
import { addToTeam, removeFromTeam, team, type TeamMember } from './my-projects-api';
import './projects.css';

/**
 * A main volunteer's team on a project (BR-040, BR-041; DECISION_LOG D-096): the volunteers
 * registered with them as reference are added or removed; each member accepts the rules on their
 * own before working, and creates applications the main volunteer submits.
 */
export function TeamPage() {
  const t = useTranslations('projects.detail');
  return (
    <AccountPage title={() => t('team')}>
      {() => (
        <>
          <DocumentTitle title={t('team')} />
          <TeamView />
        </>
      )}
    </AccountPage>
  );
}

function TeamView() {
  const { projectId = '' } = useParams();
  const t = useTranslations('projects.team');
  const tm = useTranslations('projects.mine');
  const tc = useTranslations('common');
  const queryClient = useQueryClient();
  const key = ['me', 'projects', projectId, 'team'] as const;
  const [chosen, setChosen] = useState<string[]>([]);
  const [notice, setNotice] = useState<string>();
  const current = useQuery({ queryKey: key, queryFn: () => team(projectId) });
  const add = useMutation({
    mutationFn: () => addToTeam(projectId, chosen),
    onSuccess: (next) => {
      queryClient.setQueryData(key, next);
      setChosen([]);
      setNotice(t('added'));
    },
  });
  const remove = useMutation({
    mutationFn: (member: TeamMember) => removeFromTeam(projectId, member.volunteerId),
    onSuccess: async (_, member) => {
      setNotice(t('removed', { name: member.displayName }));
      await queryClient.invalidateQueries({ queryKey: key });
    },
  });
  const back = <Link to={`/my-projects/${projectId}`}>{tm('back')}</Link>;
  if (current.isPending) return <Skeleton shape="card" />;
  if (current.error)
    return (
      <>
        {back}
        <ErrorState
          title={tc('state.error.text')}
          requestId={current.error instanceof ApiFailure ? current.error.requestId : undefined}
          onRetry={() => void current.refetch()}
        />
      </>
    );
  const { members, candidates } = current.data;
  const failure = [add.error, remove.error].find((e) => e instanceof ApiFailure);
  return (
    <>
      {back}
      {notice && (
        <Alert tone="success" live="status" onDismiss={() => setNotice(undefined)}>
          {notice}
        </Alert>
      )}
      {failure instanceof ApiFailure && (
        <Alert tone="danger" live="alert">
          {failure.message}
        </Alert>
      )}
      <Card title={t('members')} headingLevel={2}>
        {members.length === 0 ? (
          <EmptyState icon={Users} title={t('no_members')} headingLevel={3} />
        ) : (
          <ul className="my-team-list">
            {members.map((m) => (
              <li key={m.volunteerId}>
                <span>{m.displayName}</span>
                <Badge
                  tone={m.consentStatus === 'accepted' ? 'success' : 'warning'}
                  label={t(m.consentStatus)}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  icon={UserMinus}
                  iconOnly
                  onPress={() => remove.mutate(m)}
                >
                  {t('remove', { name: m.displayName })}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title={t('candidates')} headingLevel={2}>
        {candidates.length === 0 ? (
          <p>{t('no_candidates')}</p>
        ) : (
          <>
            <ul className="my-team-list">
              {candidates.map((c) => (
                <li key={c.volunteerId}>
                  <Checkbox
                    isSelected={chosen.includes(c.volunteerId)}
                    onChange={(on) =>
                      setChosen(
                        on
                          ? [...chosen, c.volunteerId]
                          : chosen.filter((id) => id !== c.volunteerId),
                      )
                    }
                  >
                    {c.displayName}
                  </Checkbox>
                </li>
              ))}
            </ul>
            <Button
              onPress={() => add.mutate()}
              disabled={chosen.length === 0}
              loading={add.isPending}
            >
              {t('add')}
            </Button>
          </>
        )}
      </Card>
    </>
  );
}
