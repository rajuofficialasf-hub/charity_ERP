import { Alert, Button, Card, Checkbox, Chip, EmptyState, Form, IconButton, Skeleton } from '@/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Link, useParams } from 'react-router';
import { useTranslations } from 'use-intl';
import { z } from 'zod';
import { useSchemaResolver } from '../../lib/form-schema';
import { AccountPage } from '../../components/AccountPage';
import { DocumentTitle } from '../../components/DocumentTitle';
import { LoadError } from '../../components/LoadError';
import { ApiFailure } from '../../api/client';
import { addToTeam, removeFromTeam, team, type TeamMember } from './my-projects-api';
import './projects.css';

/** The volunteers chosen to join the team, one at least; the server holds the rest of the rules. */
const ADD_SCHEMA = z.object({ memberVolunteerIds: z.array(z.string()).min(1) });
type AddFields = z.infer<typeof ADD_SCHEMA>;

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
  const [notice, setNotice] = useState<string>();
  const form = useForm<AddFields>({
    resolver: useSchemaResolver(ADD_SCHEMA),
    defaultValues: { memberVolunteerIds: [] },
    reValidateMode: 'onSubmit',
  });
  const chosen = useWatch({ control: form.control, name: 'memberVolunteerIds' });
  const current = useQuery({ queryKey: key, queryFn: () => team(projectId) });
  const add = useMutation({
    mutationFn: (ids: string[]) => {
      remove.reset();
      setNotice(undefined);
      return addToTeam(projectId, ids);
    },
    onSuccess: (next) => {
      queryClient.setQueryData(key, next);
      form.reset();
      setNotice(t('added'));
    },
  });
  // the button's own path: someone chosen, and nothing twice while the addition is on its way
  const send = ({ memberVolunteerIds }: AddFields) => {
    if (memberVolunteerIds.length > 0 && !add.isPending) add.mutate(memberVolunteerIds);
  };
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
  // a refused addition shows on its form; a refused removal above the team
  const failure = remove.error instanceof ApiFailure ? remove.error : undefined;
  return (
    <>
      {back}
      {notice && (
        <Alert tone="success" onDismiss={() => setNotice(undefined)}>
          {notice}
        </Alert>
      )}
      {failure && <Alert tone="error">{failure.message}</Alert>}
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
          <Form
            form={form}
            onSubmit={send}
            label={t('candidates')}
            error={add.error instanceof ApiFailure ? add.error.message : undefined}
          >
            <Controller
              control={form.control}
              name="memberVolunteerIds"
              render={({ field }) => (
                <ul className="my-team-list">
                  {candidates.map((c) => (
                    <li key={c.volunteerId}>
                      <Checkbox
                        label={c.displayName}
                        checked={field.value.includes(c.volunteerId)}
                        onChange={(on) =>
                          field.onChange(
                            on
                              ? [...field.value, c.volunteerId]
                              : field.value.filter((id) => id !== c.volunteerId),
                          )
                        }
                      />
                    </li>
                  ))}
                </ul>
              )}
            />
            {/* the button keeps its own width instead of the form's full one */}
            <div>
              <Button type="submit" disabled={chosen.length === 0} loading={add.isPending}>
                {t('add')}
              </Button>
            </div>
          </Form>
        )}
      </Card>
    </>
  );
}
