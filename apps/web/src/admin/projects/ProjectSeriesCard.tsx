import { formatCount, formatDate } from '@css/shared/format';
import { type Locale, localized } from '@css/shared/i18n';
import { Button, Chip, type ColorTone, FlipCard, LinkButton, ProgressBar } from '@/ui';
import { useLocale, useTranslations } from 'use-intl';
import { CardCover } from './CardCover';
import { CardTeam, CardTodo } from './CardParts';
import { type ProjectSeriesCard as Card, SERIES_CARD_HEIGHT } from './cards-api';

/** The application window's last days are "ending soon" from this many days left. */
const ENDING_SOON_DAYS = 7;

/** The state line of the cover: the current session, or that none runs. */
function useStateLine(current: Card['current']): { text: string; tone: ColorTone } {
  const t = useTranslations('admin.projects.series_card');
  const ts = useTranslations('admin.projects.status');
  if (!current) return { text: t('state_none'), tone: 'neutral' };
  const { status, sessionLabel: label } = current;
  if (status === 'active' || status === 'closing')
    return {
      text: t('state_session', { label, state: ts(status) }),
      tone: status === 'active' ? 'success' : 'warning',
    };
  if (status === 'draft')
    return { text: t('state_session', { label, state: ts(status) }), tone: 'info' };
  return { text: t('state_ended', { label }), tone: 'neutral' };
}

/**
 * One permanent project, a project series, as a card of a program's page (docs/ui/SCREENS.md,
 * "Project list and project page"). The front: its cover with the current session's state and
 * the days left to apply, its name, the approved people against the session's target, and the
 * session's applications, target met and last day to apply. The back: the current session's
 * RPMs, its volunteers and districts, the project's sessions and the people helped in all of
 * them, the caller's own work only where the read gives it, the way to the project, and "নতুন
 * সেশন শুরু করুন" for whoever may create a project in its program.
 */
export function ProjectSeriesCard({
  series,
  onNewSession,
}: {
  series: Card;
  /** Present when the caller may start a session of this project. */
  onNewSession?: () => void;
}) {
  const t = useTranslations('admin.projects.series_card');
  const locale = useLocale() as Locale;
  const name = localized(series.name, locale);
  const number = (n: number) => formatCount(n, locale);
  const page = `/admin/projects/series/${series.id}`;
  const current = series.current;
  const state = useStateLine(current);
  const running = current?.status === 'active' || current?.status === 'closing';
  const days =
    running && current.daysLeft !== null && current.daysLeft >= 0 ? current.daysLeft : null;
  const soon = days !== null && days <= ENDING_SOON_DAYS;
  const target = current?.target ?? null;
  const percent =
    current && target ? Math.min(100, Math.round((current.approved / target) * 100)) : null;

  return (
    <FlipCard
      title={name}
      to={page}
      height={SERIES_CARD_HEIGHT}
      badge={t('badge')}
      media={<CardCover fileId={series.coverFileId} seed={series.id} />}
      mediaCorner={
        days === null ? undefined : (
          <Chip tone={soon ? 'warning' : 'neutral'}>
            {t(soon ? 'days_soon' : 'days_left', { days: number(days) })}
          </Chip>
        )
      }
      mediaFoot={<Chip tone={state.tone}>{state.text}</Chip>}
      front={
        current && (
          <div className="card-front-foot">
            {target ? (
              <div className="card-progress">
                <ProgressBar
                  label={t('progress')}
                  value={Math.min(current.approved, target)}
                  max={target}
                  size="small"
                />
                <span className="card-progress-value">
                  {t('progress_value', {
                    approved: number(current.approved),
                    target: number(target),
                  })}
                </span>
              </div>
            ) : (
              <span className="card-progress-value">
                {t('approved_only', { approved: number(current.approved) })}
              </span>
            )}
            <dl className="card-figures">
              <div className="card-figure">
                <dt>{t('applications')}</dt>
                <dd>{number(current.applications)}</dd>
              </div>
              <div className="card-figure">
                <dt>{t('target_met')}</dt>
                <dd>{percent === null ? '—' : `${number(percent)}%`}</dd>
              </div>
              <div className="card-figure">
                <dt>{t('apply_to')}</dt>
                <dd className="card-figure-date">
                  {current.applyTo ? formatDate(current.applyTo) : '—'}
                </dd>
              </div>
            </dl>
          </div>
        )
      }
      backEyebrow={t('eyebrow', { code: series.code })}
      back={
        <>
          {current && <CardTeam rpms={current.rpms} />}
          <dl className="card-blocks">
            <div className="card-block">
              <dt>{t('volunteers')}</dt>
              <dd>{number(current?.volunteers ?? 0)}</dd>
            </div>
            <div className="card-block">
              <dt>{t('districts')}</dt>
              <dd>{number(current?.districts ?? 0)}</dd>
            </div>
            <div className="card-block">
              <dt>{t('sessions')}</dt>
              <dd>{number(series.sessionCount)}</dd>
            </div>
            <div className="card-block">
              <dt>{t('people')}</dt>
              <dd>{number(series.beneficiaries)}</dd>
            </div>
          </dl>
          {series.todo ? (
            <CardTodo todo={series.todo} />
          ) : (
            current && <p className="card-locked">{t('locked')}</p>
          )}
          <div className="card-actions">
            <LinkButton to={page} endIcon="arrow-right" fullWidth>
              {t('open')}
            </LinkButton>
            {onNewSession && (
              <Button variant="secondary" startIcon="add" fullWidth onClick={onNewSession}>
                {t('new_session')}
              </Button>
            )}
          </div>
        </>
      }
    />
  );
}
