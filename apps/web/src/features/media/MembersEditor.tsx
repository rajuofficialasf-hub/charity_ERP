import { type Locale, localized } from '@css/shared/i18n';
import { Button, Card, CheckboxGroup, Dialog, Form, SelectField, Stack, Text } from '@/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Link } from 'react-router';
import { useLocale, useTranslations } from 'use-intl';
import { z } from 'zod';
import { useSchemaResolver } from '../../lib/form-schema';
import { MEDIA_KEY, type MediaReferral, type MediaWork, mediaTeam, setMembers } from './media-api';
import { useMediaLabels } from './use-media-lists';
import { failureOf } from './work-errors';
import { LoadError } from '../../components/LoadError';
import { DialogButtons } from '../../components/DialogButtons';

/**
 * The team of a work: each member with their production roles, a link to their profile; a director
 * changes the whole team in one dialog, each member with one or more roles.
 */
export function MembersEditor({
  work,
  onSaved,
  onStale,
}: {
  work: MediaWork;
  onSaved: (next: MediaReferral, text: string) => void;
  onStale: () => void;
}) {
  const t = useTranslations('media.work');
  const labels = useMediaLabels();
  const [editing, setEditing] = useState(false);
  const roles = (codes: string[]) => codes.map(labels.role).join(', ');
  return (
    <Card
      title={t('team')}
      headingLevel={2}
      action={
        work.mayDirect ? (
          <Button variant="secondary" size="small" onClick={() => setEditing(true)}>
            {work.members.length ? t('edit_team') : t('add_member')}
          </Button>
        ) : null
      }
    >
      {work.members.length ? (
        <ul className="media-link-cards">
          {work.members.map((m) => (
            <li key={m.userId}>
              <Link to={`/media/members/${m.userId}`}>{m.name}</Link>
              <Text size="small" tone="muted">
                {roles(m.roles)}
              </Text>
            </li>
          ))}
        </ul>
      ) : (
        <Text tone="muted">{t('no_members')}</Text>
      )}
      {editing ? (
        <TeamDialog
          work={work}
          onClose={() => setEditing(false)}
          onStale={() => {
            setEditing(false);
            onStale();
          }}
          onSaved={(next) => {
            setEditing(false);
            onSaved(next, t('team_saved'));
          }}
        />
      ) : null}
    </Card>
  );
}

/** The team as edited: each member with one role at least. */
const TEAM_SCHEMA = z.object({
  members: z.array(
    z.object({ userId: z.string(), name: z.string(), roles: z.array(z.string()).min(1) }),
  ),
});
type TeamFields = z.infer<typeof TEAM_SCHEMA>;

function TeamDialog({
  work,
  onClose,
  onStale,
  onSaved,
}: {
  work: MediaWork;
  onClose: () => void;
  onStale: () => void;
  onSaved: (next: MediaReferral) => void;
}) {
  const t = useTranslations('media.work');
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;
  const labels = useMediaLabels();
  const people = useQuery({ queryKey: [...MEDIA_KEY, 'team'], queryFn: mediaTeam });
  const form = useForm<TeamFields>({
    resolver: useSchemaResolver(TEAM_SCHEMA),
    defaultValues: { members: work.members },
    reValidateMode: 'onSubmit',
  });
  const members = useWatch({ control: form.control, name: 'members' });
  const save = useMutation({
    mutationFn: ({ members: chosen }: TeamFields) =>
      setMembers(
        work.id,
        work.version,
        chosen.map((m) => ({ userId: m.userId, roles: m.roles })),
      ),
    onSuccess: onSaved,
    // a team another director saved meanwhile: the page reads it again
    onError: (error) => {
      if (failureOf(error, { stale: '', fallback: '' }).stale) onStale();
    },
  });
  const roleOptions = labels.roles
    .filter((r) => r.active)
    .map((r) => ({ value: r.code, label: localized(r.label, locale) }));
  const ready = TEAM_SCHEMA.safeParse({ members }).success;
  // the button's own path: every member with a role, and nothing twice while a save is on its way
  const send = (fields: TeamFields) => {
    if (ready && !save.isPending) save.mutate(fields);
  };
  return (
    <Dialog
      title={t('team')}
      open
      onClose={onClose}
      dismissible={!save.isPending}
      actions={
        <DialogButtons
          onCancel={onClose}
          onConfirm={() => void form.handleSubmit(send)()}
          confirmLabel={tc('action.save')}
          disabled={!ready}
          pending={save.isPending}
        />
      }
    >
      <Form
        form={form}
        onSubmit={send}
        label={t('team')}
        error={
          save.error
            ? failureOf(save.error, { stale: t('stale'), fallback: tc('state.error.text') }).text
            : undefined
        }
      >
        <Controller
          control={form.control}
          name="members"
          render={({ field }) => {
            const team = field.value;
            const set = (next: TeamFields['members']) => field.onChange(next);
            const candidates = (people.data ?? []).filter(
              (p) => !team.some((m) => m.userId === p.id),
            );
            const add = (id: string) => {
              const person = people.data?.find((p) => p.id === id);
              if (person) set([...team, { userId: person.id, name: person.name, roles: [] }]);
            };
            return (
              <>
                {people.error ? (
                  <LoadError error={people.error} onRetry={() => void people.refetch()} />
                ) : (
                  // a picker of the next member, empty again once one is added
                  <SelectField
                    label={t('member_search')}
                    value=""
                    disabled={people.isPending}
                    options={candidates.map((p) => ({ value: p.id, label: p.name }))}
                    onChange={add}
                  />
                )}
                {team.length === 0 ? <Text tone="muted">{t('no_members')}</Text> : null}
                {team.map((m) => (
                  <Stack key={m.userId} gap={1}>
                    <Stack direction="row" gap={2} align="center">
                      <strong>{m.name}</strong>
                      <Button
                        variant="text"
                        size="small"
                        startIcon="close"
                        onClick={() => set(team.filter((x) => x.userId !== m.userId))}
                      >
                        {t('remove_member', { name: m.name })}
                      </Button>
                    </Stack>
                    <CheckboxGroup
                      label={t('roles')}
                      columns={2}
                      options={roleOptions}
                      value={m.roles}
                      onChange={(ids) =>
                        set(team.map((x) => (x.userId === m.userId ? { ...x, roles: ids } : x)))
                      }
                    />
                  </Stack>
                ))}
              </>
            );
          }}
        />
      </Form>
    </Dialog>
  );
}
