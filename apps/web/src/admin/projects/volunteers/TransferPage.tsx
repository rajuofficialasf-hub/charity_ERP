import { uuidv7 } from '@css/shared';
import { formatCount } from '@css/shared/format';
import { type Locale, localized } from '@css/shared/i18n';
import {
  Alert,
  Card,
  Checkbox,
  EmptyState,
  Form,
  FormSubmitButton,
  FormTextField,
  Page,
  SelectField,
  Skeleton,
  Stack,
  Switch,
  Text,
} from '@/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Link, useParams, useSearchParams } from 'react-router';
import { useLocale, useTranslations } from 'use-intl';
import { DocumentTitle } from '../../../components/DocumentTitle';
import { stateLabel } from '../../../features/applications/status';
import { useAuth } from '../../../lib/auth';
import { showFailure, useSchemaResolver } from '../../../lib/form-schema';
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
import { LoadError } from '../../../components/LoadError';
import { z } from 'zod';

/** A choice of the new volunteer: someone on the project, or someone added with the handover. */
interface Target {
  volunteerId: string;
  add: boolean;
}

/** The applications ticked, the new volunteer, the team move and a reason of three letters. */
const TRANSFER_SCHEMA = z
  .object({
    applicationIds: z.array(z.string()).min(1),
    to: z.custom<Target | null>(),
    moveTeam: z.boolean(),
    reason: z.string(),
  })
  .superRefine((v, ctx) => {
    if (!v.to) ctx.addIssue({ code: 'custom', path: ['to'], message: 'validation.required' });
    if (v.reason.trim().length < 3)
      ctx.addIssue({ code: 'custom', path: ['reason'], message: 'validation.too_short' });
  });
type TransferFields = z.infer<typeof TRANSFER_SCHEMA>;
const EMPTY: TransferFields = { applicationIds: [], to: null, moveTeam: false, reason: '' };

/** Every page of a cursor list, read one after another. */
async function allPages<T>(
  page: (cursor: string | null) => Promise<{ data: T[]; meta: { nextCursor: string | null } }>,
): Promise<T[]> {
  const rows: T[] = [];
  let cursor: string | null = null;
  do {
    const next = await page(cursor);
    rows.push(...next.data);
    cursor = next.meta.nextCursor;
  } while (cursor);
  return rows;
}

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
  const form = useForm<TransferFields>({
    resolver: useSchemaResolver(TRANSFER_SCHEMA),
    defaultValues: EMPTY,
    reValidateMode: 'onSubmit',
  });
  const values = useWatch({ control: form.control }) as TransferFields;
  const ticked = new Set(values.applicationIds);
  const to = values.to;
  const setTicked = (ids: Set<string>) => form.setValue('applicationIds', [...ids]);
  // one key per attempt: a repeat after a lost answer is answered with the same move
  const [key, setKey] = useState(() => uuidv7());
  const fresh = () => setKey(uuidv7());
  const [result, setResult] = useState<TransferResult | null>(null);
  const project = useQuery({
    queryKey: [...PROJECTS_KEY, 'one-plain', projectId],
    queryFn: () => projectOf(projectId),
  });
  const people = useQuery({
    queryKey: [...volunteersKey(projectId), 'all'],
    queryFn: () => allPages((cursor) => assignments(projectId, cursor)),
  });
  const newcomers = useQuery({
    queryKey: [...volunteersKey(projectId), 'candidates'],
    queryFn: () => allPages((cursor) => candidates(projectId, {}, cursor)),
    enabled: assigns,
  });
  const apps = useQuery({
    queryKey: transferCandidatesKey(projectId, from ?? ''),
    queryFn: () => transferCandidates(projectId, from ?? ''),
    enabled: Boolean(from),
  });
  const send = async (v: TransferFields) => {
    let out: TransferResult;
    try {
      out = await transferApplications(projectId, key, {
        fromVolunteerId: from ?? '',
        toVolunteerId: v.to?.volunteerId ?? '',
        applicationIds: v.applicationIds,
        reason: v.reason.trim(),
        moveTeam: v.moveTeam,
        assign: Boolean(v.to?.add),
      });
    } catch (failure) {
      showFailure(form, failure, tc('state.error.text'));
      return;
    }
    setResult(out);
    form.reset(EMPTY);
    fresh();
    await queryClient.invalidateQueries({ queryKey: PROJECTS_KEY });
  };
  if (project.isPending || people.isPending) return <Skeleton shape="card" />;
  if (project.error || people.error)
    return (
      <LoadError
        error={project.error}
        onRetry={() => {
          void project.refetch();
          void people.refetch();
        }}
      />
    );
  const name = localized(project.data.name, locale);
  const list = apps.data ?? [];
  const everyone = people.data;
  const target = everyone.find((p) => p.volunteerId === to?.volunteerId);
  const limit = project.data.perVolunteerLimit;
  const after = (target?.applicationsCounted ?? 0) + ticked.size;
  const overLimit = limit !== null && ticked.size > 0 && Boolean(to) && after > limit;
  const allTicked = list.length > 0 && ticked.size === list.length;
  const ready = Boolean(from) && TRANSFER_SCHEMA.safeParse(values).success;
  const toOptions = [
    ...everyone
      .filter((p) => p.volunteerId !== from)
      .map((p) => ({ value: p.volunteerId, label: p.displayName })),
    ...(newcomers.data ?? [])
      .filter((c) => !everyone.some((p) => p.volunteerId === c.volunteerId))
      .map((c) => ({ value: c.volunteerId, label: `${c.displayName} · ${t('to_new')}` })),
  ];
  const chooseTarget = (id: string | null) => {
    fresh();
    form.setValue(
      'to',
      id ? { volunteerId: id, add: !everyone.some((p) => p.volunteerId === id) } : null,
    );
  };
  const toggle = (id: string, on: boolean) => {
    fresh();
    const next = new Set(ticked);
    if (on) next.add(id);
    else next.delete(id);
    setTicked(next);
  };
  return (
    <Stack gap={3}>
      <DocumentTitle title={t('title', { name })} />
      <Link to={`/admin/projects/${projectId}/volunteers`}>{t('back')}</Link>
      <Page title={t('title', { name })} description={t('help')} documentTitle={false} />
      {result ? (
        <Alert tone="success" onDismiss={() => setResult(null)}>
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
        <SelectField
          label={t('from')}
          value={from ?? ''}
          options={everyone.map((p) => ({ value: p.volunteerId, label: p.displayName }))}
          onChange={(id) => {
            setTicked(new Set());
            form.setValue('to', null);
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
          <LoadError error={apps.error} onRetry={() => void apps.refetch()} />
        ) : list.length === 0 ? (
          <EmptyState title={t('no_applications')} />
        ) : (
          <Stack gap={2}>
            <Checkbox
              label={t('select_all')}
              checked={allTicked}
              indeterminate={ticked.size > 0 && !allTicked}
              onChange={(on) => {
                fresh();
                setTicked(on ? new Set(list.map((a) => a.id)) : new Set());
              }}
            />
            <ul className="admin-transfer-list">
              {list.map((a) => (
                <li key={a.id}>
                  <Checkbox
                    label={`${a.beneficiaryName ?? t('unnamed')} · ${a.appNo ?? t('no_number')} · ${stateLabel(ts, a.status)}`}
                    checked={ticked.has(a.id)}
                    onChange={(on) => toggle(a.id, on)}
                  />
                </li>
              ))}
            </ul>
            <Text tone="muted">{t('selected', { count: formatCount(ticked.size, locale) })}</Text>
          </Stack>
        )}
      </Card>
      <Card title={t('to_title')} headingLevel={2}>
        <Stack gap={2}>
          <SelectField
            label={t('to')}
            value={to?.volunteerId ?? ''}
            options={toOptions}
            onChange={chooseTarget}
            hint={assigns ? t('to_new_help') : undefined}
          />
          {movesTeams ? (
            <Controller
              control={form.control}
              name="moveTeam"
              render={({ field }) => (
                <Switch label={t('move_team')} checked={field.value} onChange={field.onChange} />
              )}
            />
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
      {/* the choices above are the form's too; the form element holds the reason and the send */}
      <Form
        form={form}
        onSubmit={send}
        label={t('submit')}
        error={form.formState.errors.root?.server?.message}
      >
        <FormTextField
          name="reason"
          rows={4}
          label={t('reason')}
          hint={t('reason_help')}
          required
        />
        <div>
          <FormSubmitButton variant="primary" disabled={!ready}>
            {t('submit')}
          </FormSubmitButton>
        </div>
      </Form>
    </Stack>
  );
}
