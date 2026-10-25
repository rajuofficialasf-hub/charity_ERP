import { uuidv7 } from '@css/shared';
import { formatCount } from '@css/shared/format';
import { type Locale, localized } from '@css/shared/i18n';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  EmptyState,
  ErrorState,
  Select,
  Skeleton,
  Stack,
  Switch,
  Text,
  TextArea,
} from '@css/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardList } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { useLocale, useTranslations } from 'use-intl';
import { DocumentTitle } from '../../../components/DocumentTitle';
import { stateLabel } from '../../../features/applications/status';
import { ApiFailure } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { ForbiddenContent } from '../../AdminLayout';
import { canAssignVolunteers, canMoveTeams, canTransferApplications } from '../../roles';
import { project as projectOf, PROJECTS_KEY } from '../projects-api';
import { assignments, candidates, volunteersKey } from './project-volunteers-api';
import {
  type TransferResult,
  transferApplications,
  transferCandidates,
  transferCandidatesKey,
} from './transfer-api';

/** The prefix of a choice that adds a volunteer to the project with the handover. */
const NEW = 'new:';

/**
 * The application transfer (docs/ui/SCREENS.md, "Application review list and detail"): the
 * official picks the volunteer whose applications move, ticks them (or all), picks the new
 * volunteer from the project or adds one to it, decides on the team, reads the limit warning
 * before confirming and gives the reason. The server checks every step again.
 */
export function TransferPage() {
  const { me } = useAuth();
  if (!me) return null;
  if (!canTransferApplications(me)) return <ForbiddenContent />;
  return <Transfer assigns={canAssignVolunteers(me)} movesTeams={canMoveTeams(me)} />;
}

function Transfer({ assigns, movesTeams }: { assigns: boolean; movesTeams: boolean }) {
  const { projectId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const t = useTranslations('admin.projects.transfer');
  const ts = useTranslations('applications.status');
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;
  const queryClient = useQueryClient();
  const from = params.get('from');
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [to, setTo] = useState<string | null>(null);
  const [moveTeam, setMoveTeam] = useState(false);
  const [reason, setReason] = useState('');
  const [result, setResult] = useState<TransferResult | null>(null);
  const project = useQuery({
    queryKey: [...PROJECTS_KEY, 'one-plain', projectId],
    queryFn: () => projectOf(projectId),
  });
  const people = useQuery({
    queryKey: [...volunteersKey(projectId), 'all'],
    queryFn: async () => (await assignments(projectId, null)).data,
  });
  const newcomers = useQuery({
    queryKey: [...volunteersKey(projectId), 'candidates'],
    queryFn: async () => (await candidates(projectId, {}, null)).data,
    enabled: assigns,
  });
  const apps = useQuery({
    queryKey: transferCandidatesKey(projectId, from ?? ''),
    queryFn: () => transferCandidates(projectId, from ?? ''),
    enabled: Boolean(from),
  });
  const send = useMutation({
    mutationFn: () =>
      transferApplications(projectId, uuidv7(), {
        fromVolunteerId: from ?? '',
        toVolunteerId: (to ?? '').replace(NEW, ''),
        applicationIds: [...ticked],
        reason: reason.trim(),
        moveTeam,
        assign: Boolean(to?.startsWith(NEW)),
      }),
    onSuccess: async (out) => {
      setResult(out);
      setTicked(new Set());
      setReason('');
      setMoveTeam(false);
      await queryClient.invalidateQueries({ queryKey: PROJECTS_KEY });
    },
  });
  if (project.isPending || people.isPending) return <Skeleton shape="card" />;
  if (project.error || people.error)
    return (
      <ErrorState
        title={tc('state.error.text')}
        onRetry={() => {
          void project.refetch();
          void people.refetch();
        }}
      />
    );
  const name = localized(project.data.name, locale);
  const list = apps.data ?? [];
  const everyone = people.data;
  const target = everyone.find((p) => p.volunteerId === to);
  const limit = project.data.perVolunteerLimit;
  const after = (target?.applicationsCounted ?? 0) + ticked.size;
  const overLimit = limit !== null && ticked.size > 0 && Boolean(to) && after > limit;
  const allTicked = list.length > 0 && ticked.size === list.length;
  const ready = Boolean(from) && Boolean(to) && ticked.size > 0 && reason.trim().length >= 3;
  const toOptions = [
    ...everyone
      .filter((p) => p.volunteerId !== from)
      .map((p) => ({ id: p.volunteerId, label: p.displayName })),
    ...(newcomers.data ?? [])
      .filter((c) => !everyone.some((p) => p.volunteerId === c.volunteerId))
      .map((c) => ({ id: `${NEW}${c.volunteerId}`, label: `${c.displayName} · ${t('to_new')}` })),
  ];
  const toggle = (id: string, on: boolean) => {
    const next = new Set(ticked);
    if (on) next.add(id);
    else next.delete(id);
    setTicked(next);
  };
  return (
    <Stack gap={3}>
      <DocumentTitle title={t('title', { name })} />
      <Link to={`/admin/projects/${projectId}/volunteers`}>{t('back')}</Link>
      <h1 className="admin-title">{t('title', { name })}</h1>
      <Text tone="muted">{t('help')}</Text>
      {result ? (
        <Alert tone="success" live="status" onDismiss={() => setResult(null)}>
          {result.teamMoved
            ? t('done_team', {
                count: formatCount(result.moved.length, locale),
                team: formatCount(result.teamMoved, locale),
              })
            : t('done', { count: formatCount(result.moved.length, locale) })}
          {result.overLimit ? ` ${t('done_over_limit')}` : ''}
        </Alert>
      ) : null}
      <Card title={t('from_title')} headingLevel={2}>
        <Select
          label={t('from')}
          value={from}
          options={everyone.map((p) => ({ id: p.volunteerId, label: p.displayName }))}
          onChange={(id) => {
            setTicked(new Set());
            setTo(null);
            setParams(id ? { from: id } : {}, { replace: true });
          }}
        />
      </Card>
      <Card title={t('applications_title')} headingLevel={2}>
        {!from ? (
          <Text tone="muted">{t('pick_from')}</Text>
        ) : apps.isPending ? (
          <Skeleton shape="text" />
        ) : apps.error ? (
          <ErrorState title={tc('state.error.text')} onRetry={() => void apps.refetch()} />
        ) : list.length === 0 ? (
          <EmptyState icon={ClipboardList} title={t('no_applications')} headingLevel={3} />
        ) : (
          <Stack gap={2}>
            <Checkbox
              isSelected={allTicked}
              isIndeterminate={ticked.size > 0 && !allTicked}
              onChange={(on) => setTicked(on ? new Set(list.map((a) => a.id)) : new Set())}
            >
              {t('select_all')}
            </Checkbox>
            <ul className="admin-transfer-list">
              {list.map((a) => (
                <li key={a.id}>
                  <Checkbox isSelected={ticked.has(a.id)} onChange={(on) => toggle(a.id, on)}>
                    {`${a.beneficiaryName ?? t('unnamed')} · ${a.appNo ?? t('no_number')} · ${stateLabel(ts, a.status)}`}
                  </Checkbox>
                </li>
              ))}
            </ul>
            <Text tone="muted">{t('selected', { count: formatCount(ticked.size, locale) })}</Text>
          </Stack>
        )}
      </Card>
      <Card title={t('to_title')} headingLevel={2}>
        <Stack gap={2}>
          <Select
            label={t('to')}
            value={to}
            options={toOptions}
            onChange={setTo}
            helper={assigns ? t('to_new_help') : undefined}
          />
          {movesTeams ? (
            <Switch isSelected={moveTeam} onChange={setMoveTeam}>
              {t('move_team')}
            </Switch>
          ) : null}
          {movesTeams ? <Text tone="muted">{t('move_team_help')}</Text> : null}
          {overLimit ? (
            <Alert tone="warning">
              {t('over_limit', {
                after: formatCount(after, locale),
                limit: formatCount(limit ?? 0, locale),
              })}
            </Alert>
          ) : null}
        </Stack>
      </Card>
      <TextArea
        label={t('reason')}
        helper={t('reason_help')}
        value={reason}
        onChange={setReason}
        required
        name="reason"
      />
      {send.error ? (
        <Alert tone="danger">
          {send.error instanceof ApiFailure ? send.error.message : tc('state.error.text')}
        </Alert>
      ) : null}
      <div>
        <Button
          variant="primary"
          disabled={!ready}
          loading={send.isPending}
          onPress={() => send.mutate()}
        >
          {t('submit')}
        </Button>
      </div>
    </Stack>
  );
}
