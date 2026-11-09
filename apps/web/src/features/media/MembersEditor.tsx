import { type Locale, localized } from '@css/shared/i18n';
import { Alert, Button, Card, CheckboxGroup, Dialog, SelectField, Stack, Text } from '@/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { useLocale, useTranslations } from 'use-intl';
import { MEDIA_KEY, type MediaReferral, type MediaWork, mediaTeam, setMembers } from './media-api';
import { useMediaLabels } from './use-media-lists';
import { failureOf } from './work-errors';
import { LoadError } from '../../components/LoadError';
import { DialogButtons } from '../../components/DialogButtons';

type Member = { userId: string; name: string; roles: string[] };

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
  const [members, setTeam] = useState<Member[]>(work.members);
  const [adding, setAdding] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () =>
      setMembers(
        work.id,
        work.version,
        members.map((m) => ({ userId: m.userId, roles: m.roles })),
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
  const candidates = (people.data ?? []).filter((p) => !members.some((m) => m.userId === p.id));
  const add = (id: string | null) => {
    const person = people.data?.find((p) => p.id === id);
    if (!person) return;
    setTeam((all) => [...all, { userId: person.id, name: person.name, roles: [] }]);
    setAdding(null);
  };
  const ready = members.every((m) => m.roles.length > 0);
  return (
    <Dialog
      title={t('team')}
      open
      onClose={onClose}
      dismissible={!save.isPending}
      actions={
        <DialogButtons
          onCancel={onClose}
          onConfirm={() => save.mutate()}
          confirmLabel={tc('action.save')}
          disabled={!ready}
          pending={save.isPending}
        />
      }
    >
      {save.error ? (
        <Alert tone="error">
          {failureOf(save.error, { stale: t('stale'), fallback: tc('state.error.text') }).text}
        </Alert>
      ) : null}
      {people.error ? (
        <LoadError error={people.error} onRetry={() => void people.refetch()} />
      ) : (
        <SelectField
          label={t('member_search')}
          value={adding ?? ''}
          disabled={people.isPending}
          options={candidates.map((p) => ({ value: p.id, label: p.name }))}
          onChange={add}
        />
      )}
      {members.length === 0 ? <Text tone="muted">{t('no_members')}</Text> : null}
      {members.map((m) => (
        <Stack key={m.userId} gap={1}>
          <Stack direction="row" gap={2} align="center">
            <strong>{m.name}</strong>
            <Button
              variant="text"
              size="small"
              startIcon="close"
              onClick={() => setTeam((all) => all.filter((x) => x.userId !== m.userId))}
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
              setTeam((all) => all.map((x) => (x.userId === m.userId ? { ...x, roles: ids } : x)))
            }
          />
        </Stack>
      ))}
    </Dialog>
  );
}
