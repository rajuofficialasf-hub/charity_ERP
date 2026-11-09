import { Alert, Button, Card, Checkbox, Chip, EmptyState, IconButton, Skeleton } from '@/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useTranslations } from 'use-intl';
import { AccountPage } from '../../components/AccountPage';
import { DocumentTitle } from '../../components/DocumentTitle';
import { LoadError } from '../../components/LoadError';
import { ApiFailure } from '../../api/client';
import { addToTeam, removeFromTeam, team, type TeamMember } from './my-projects-api';
import './projects.css';

/**
 * A main volunteer's team on a project (docs/BUSINESS_RULES.md, the team members): the volunteers
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
  const queryClient = useQueryClient();
  const key = ['me', 'projects', projectId, 'team'] as const;
  const [chosen, setChosen] = useState<string[]>([]);
  const [notice, setNotice] = useState<string>();
  const current = useQuery({ queryKey: key, queryFn: () => team(projectId) });
  const add = useMutation({
    mutationFn: () => {
      remove.reset();
      setNotice(undefined);
      return addToTeam(projectId, chosen);
    },
    onSuccess: (next) => {
      queryClient.setQueryData(key, next);
      setChosen([]);
      setNotice(t('added'));
    },
  });
  const remove = useMutation({
    mutationFn: (member: TeamMember) => {
      add.reset();
      setNotice(undefined);
      return removeFromTeam(projectId, member.volunteerId);
    },
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
        <LoadError error={current.error} onRetry={() => void current.refetch()} />
      </>
    );
  const { members, candidates } = current.data;
  const failure = [add.error, remove.error].find((e) => e instanceof ApiFailure);
  return (
    <>
      {back}
      {notice && (
        <Alert tone="success" onDismiss={() => setNotice(undefined)}>
          {notice}
        </Alert>
      )}
      {failure instanceof ApiFailure && <Alert tone="error">{failure.message}</Alert>}
      <Card title={t('members')} headingLevel={2}>
        {members.length === 0 ? (
          <EmptyState icon="users" title={t('no_members')} />
        ) : (
          <ul className="my-team-list">
            {members.map((m) => (
              <li key={m.volunteerId}>
                <span>{m.displayName}</span>
                <Chip tone={m.consentStatus === 'accepted' ? 'success' : 'warning'}>
                  {t(m.consentStatus)}
                </Chip>
                <IconButton
                  label={t('remove', { name: m.displayName })}
                  icon="user-minus"
                  onClick={() => remove.mutate(m)}
                  disabled={remove.isPending}
                />
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
                    label={c.displayName}
                    checked={chosen.includes(c.volunteerId)}
                    onChange={(on) =>
                      setChosen(
                        on
                          ? [...chosen, c.volunteerId]
                          : chosen.filter((id) => id !== c.volunteerId),
                      )
                    }
                  />
                </li>
              ))}
            </ul>
            <Button
              onClick={() => add.mutate()}
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
