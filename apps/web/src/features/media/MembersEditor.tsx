import { type Locale, localized } from '@css/shared/i18n';
import {
  Alert,
  Button,
  Card,
  CheckboxGroup,
  ErrorState,
  Grid,
  Modal,
  Select,
  Stack,
  Text,
} from '@css/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { useLocale, useTranslations } from 'use-intl';
import { MEDIA_KEY, type MediaReferral, type MediaWork, mediaTeam, setMembers } from './media-api';
import { useMediaLabels } from './use-media-lists';
import { failureOf } from './work-errors';

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
      actions={
        work.mayDirect ? (
          <Button variant="secondary" size="sm" onPress={() => setEditing(true)}>
            {work.members.length ? t('edit_team') : t('add_member')}
          </Button>
        ) : null
      }
    >
      {work.members.length ? (
        <Grid gap={2} as="ul" role="list" className="media-link-cards">
          {work.members.map((m) => (
            <li key={m.userId}>
              <Link to={`/media/members/${m.userId}`}>{m.name}</Link>
              <Text as="small" tone="muted">
                {roles(m.roles)}
              </Text>
            </li>
          ))}
        </Grid>
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
    .map((r) => ({ id: r.code, label: localized(r.label, locale) }));
  const candidates = (people.data ?? []).filter((p) => !members.some((m) => m.userId === p.id));
  const add = (id: string | null) => {
    const person = people.data?.find((p) => p.id === id);
    if (!person) return;
    setTeam((all) => [...all, { userId: person.id, name: person.name, roles: [] }]);
    setAdding(null);
  };
  const ready = members.every((m) => m.roles.length > 0);
  return (
    <Modal
      title={t('team')}
      isOpen
      onClose={onClose}
      dismissible={!save.isPending}
      secondaryAction={
        <Button variant="secondary" onPress={onClose} disabled={save.isPending}>
          {tc('action.cancel')}
        </Button>
      }
      primaryAction={
        <Button onPress={() => save.mutate()} disabled={!ready} loading={save.isPending}>
          {tc('action.save')}
        </Button>
      }
    >
      {save.error ? (
        <Alert tone="danger" live="alert">
          {failureOf(save.error, { stale: t('stale'), fallback: tc('state.error.text') }).text}
        </Alert>
      ) : null}
      {people.error ? (
        <ErrorState title={tc('state.error.text')} onRetry={() => void people.refetch()} />
      ) : (
        <Select
          label={t('member_search')}
          value={adding}
          disabled={people.isPending}
          options={candidates.map((p) => ({ id: p.id, label: p.name }))}
          onChange={add}
        />
      )}
      {members.length === 0 ? <Text tone="muted">{t('no_members')}</Text> : null}
      {members.map((m) => (
        <Stack key={m.userId} gap={1}>
          <Stack direction="row" gap={2} align="center">
            <strong>{m.name}</strong>
            <Button
              variant="ghost"
              size="sm"
              icon={X}
              iconOnly
              onPress={() => setTeam((all) => all.filter((x) => x.userId !== m.userId))}
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
    </Modal>
  );
}
