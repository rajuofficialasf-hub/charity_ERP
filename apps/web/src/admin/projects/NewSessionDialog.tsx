import { uuidv7 } from '@css/shared';
import { type Locale, localized } from '@css/shared/i18n';
import { sessionLabel, sessionPeriod } from '@css/shared/projects';
import {
  Button,
  DescriptionList,
  Dialog,
  Form,
  FormSelectField,
  MonthField,
  Skeleton,
  Text,
} from '@/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useRef } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Navigate, useNavigate } from 'react-router';
import { useLocale, useTranslations } from 'use-intl';
import { z } from 'zod';
import { LoadError } from '../../components/LoadError';
import { showFailure, useSchemaResolver } from '../../lib/form-schema';
import { CARDS_KEY, type ProjectSeries, seriesDetail, startSession } from './cards-api';
import { PROJECTS_KEY } from './projects-api';

type SessionFields = { periodFrom: string; periodTo: string; sourceProjectId: string };

const COPIED = ['components', 'form', 'rules', 'syllabus', 'scoring'] as const;
const AGAIN = ['dates', 'budget', 'areas', 'volunteers', 'quotas'] as const;

/**
 * The sessions of a series newest first by their start month (the read lists them so; this keeps
 * the dialog's defaults right whatever the order), and the ones a copy may start from: those the
 * caller's scope reaches, never a cancelled one. With none, a new session starts on the wizard.
 */
export function sessionSources(series: ProjectSeries) {
  return newestFirst(series).filter((s) => s.canOpen && s.status !== 'cancelled');
}
const newestFirst = (series: ProjectSeries) =>
  [...series.sessions].sort((a, b) => b.periodFrom.localeCompare(a.periodFrom));

/** The same months a year later: a new session follows the newest one by a year. */
const yearLater = (month: string) => `${Number(month.slice(0, 4)) + 1}${month.slice(4)}`;

/**
 * "নতুন সেশন শুরু করুন" of a permanent project (docs/ui/SCREENS.md, "Project list and project
 * page"): the start and end month with the label they give, the session it copies (the newest the
 * caller reaches by default), and what a copy carries and what is given again. "খসড়া তৈরি করুন"
 * creates the draft under an idempotency key and opens its setup.
 */
export function NewSessionDialog({ seriesId, onClose }: { seriesId: string; onClose: () => void }) {
  const t = useTranslations('admin.projects.session_dialog');
  const series = useQuery({
    queryKey: [...CARDS_KEY, 'series-detail', seriesId],
    queryFn: () => seriesDetail(seriesId),
  });
  // nothing to copy from: the wizard starts the session blank, from a workflow or a template
  if (series.data && !sessionSources(series.data).length)
    return <Navigate to={`/admin/projects/new?seriesId=${series.data.id}`} />;
  if (series.data) return <SessionForm series={series.data} onClose={onClose} />;
  return (
    <Dialog title={t('title')} open onClose={onClose}>
      {series.error ? (
        <LoadError error={series.error} onRetry={() => void series.refetch()} />
      ) : (
        <Skeleton shape="card" />
      )}
    </Dialog>
  );
}

function SessionForm({ series, onClose }: { series: ProjectSeries; onClose: () => void }) {
  const t = useTranslations('admin.projects.session_dialog');
  const tc = useTranslations('common.action');
  const locale = useLocale() as Locale;
  const title = t('title');
  const td = useTranslations('admin.projects.dialog');
  const tz = useTranslations('admin.projects.wizard');
  const te = useTranslations('common.state.error');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  // the sessions a copy may start from: those the caller's scope reaches, newest first
  const sources = sessionSources(series);
  const newest = newestFirst(series).find((s) => s.status !== 'cancelled');
  const thisYear = new Date().getFullYear();
  const schema = useMemo(
    () =>
      z
        .object({
          periodFrom: z.string(),
          periodTo: z.string(),
          sourceProjectId: z.string().min(1),
        })
        .refine(
          (v) =>
            sessionPeriod.safeParse({ periodFrom: v.periodFrom, periodTo: v.periodTo }).success,
          { path: ['periodTo'], message: tz('period_invalid') },
        ),
    [tz],
  );
  const form = useForm<SessionFields>({
    resolver: useSchemaResolver(schema),
    defaultValues: {
      periodFrom: newest ? yearLater(newest.periodFrom) : `${thisYear}-01`,
      periodTo: newest ? yearLater(newest.periodTo) : `${thisYear}-12`,
      sourceProjectId: sources[0]!.id,
    },
    reValidateMode: 'onSubmit',
  });
  const values = useWatch({ control: form.control }) as SessionFields;
  const pending = form.formState.isSubmitting;
  const period = sessionPeriod.safeParse({
    periodFrom: values.periodFrom,
    periodTo: values.periodTo,
  }).success;
  // one key per request: the same request sent again is the same session, a changed one is new
  const sent = useRef<{ body: string; key: string } | null>(null);
  // Enter in a field and the button both submit: one request at a time
  const running = useRef(false);

  const create = async (v: SessionFields) => {
    if (running.current) return;
    running.current = true;
    const body = {
      periodFrom: v.periodFrom,
      periodTo: v.periodTo,
      sourceProjectId: v.sourceProjectId,
    };
    const text = JSON.stringify(body);
    if (sent.current?.body !== text) sent.current = { body: text, key: uuidv7() };
    try {
      const made = await startSession(series.id, body, sent.current.key);
      await queryClient.invalidateQueries({ queryKey: PROJECTS_KEY });
      await navigate(`/admin/projects/${made.id}/setup`);
    } catch (failure) {
      showFailure(form, failure, te('text'));
    } finally {
      running.current = false;
    }
  };

  return (
    <Dialog
      title={title}
      open
      onClose={onClose}
      dismissible={!pending}
      actions={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            {tc('cancel')}
          </Button>
          <Button onClick={() => void form.handleSubmit(create)()} loading={pending}>
            {t('create')}
          </Button>
        </>
      }
    >
      <Form
        form={form}
        onSubmit={create}
        label={title}
        error={form.formState.errors.root?.server?.message}
      >
        <Text tone="muted">{localized(series.name, locale)}</Text>
        <div className="session-dialog-months">
          {(['periodFrom', 'periodTo'] as const).map((field) => (
            <Controller
              key={field}
              control={form.control}
              name={field}
              render={({ field: f, fieldState }) => (
                <MonthField
                  label={field === 'periodFrom' ? td('period_from') : td('period_to')}
                  hint={field === 'periodTo' ? td('period_hint') : undefined}
                  required
                  value={f.value}
                  onChange={f.onChange}
                  onBlur={f.onBlur}
                  error={fieldState.error?.message}
                />
              )}
            />
          ))}
        </div>
        <DescriptionList
          items={[
            {
              label: td('session_label'),
              value: period ? sessionLabel(values.periodFrom, values.periodTo) : '—',
            },
          ]}
        />
        <FormSelectField
          name="sourceProjectId"
          label={t('source')}
          required
          searchable={false}
          options={sources.map((s) => ({
            value: s.id,
            label: t('source_option', { label: s.sessionLabel }),
          }))}
        />
        <div className="session-dialog-lists">
          <section aria-label={t('copied')}>
            <h3>{t('copied')}</h3>
            <ul>
              {COPIED.map((item) => (
                <li key={item}>{t(`copied_items.${item}`)}</li>
              ))}
            </ul>
          </section>
          <section aria-label={t('again')}>
            <h3>{t('again')}</h3>
            <ul>
              {AGAIN.map((item) => (
                <li key={item}>{t(`again_items.${item}`)}</li>
              ))}
            </ul>
          </section>
        </div>
      </Form>
    </Dialog>
  );
}
