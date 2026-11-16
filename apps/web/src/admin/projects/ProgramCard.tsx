import { formatCount } from '@css/shared/format';
import { type Locale, localized } from '@css/shared/i18n';
import { Button, Chip, FlipCard, LinkButton } from '@/ui';
import { useLocale, useTranslations } from 'use-intl';
import { PersonAvatar } from '../../components/PersonPhoto';
import { CardCover } from './CardCover';
import { CardTeam, CardTodo } from './CardParts';
import { type ProgramCard as Card, PROGRAM_CARD_HEIGHT } from './cards-api';

/**
 * One program as a card of the programs and projects tab (docs/ui/SCREENS.md, "Project list and
 * project page"). The front: its cover, its name and three figures (its projects, the running
 * ones, the people helped). The back: its manager, the RPMs of its current sessions, the
 * applications and volunteers of its running sessions, the caller's own work only where the read
 * gives it, its description, and the way to its projects; "Edit program" for those who manage
 * the programs.
 */
export function ProgramCard({
  program,
  onEdit,
}: {
  program: Card;
  /** Present for those who may edit the program. */
  onEdit?: () => void;
}) {
  const t = useTranslations('admin.projects.cards');
  const locale = useLocale() as Locale;
  const name = localized(program.name, locale);
  const number = (n: number) => formatCount(n, locale);
  // the program's page with its projects as cards
  const projects = `/admin/projects/programs/${program.id}`;

  return (
    <FlipCard
      title={name}
      to={projects}
      height={PROGRAM_CARD_HEIGHT}
      badge={t('program_badge')}
      media={<CardCover fileId={program.coverFileId} seed={program.id} />}
      mediaFoot={program.active ? undefined : <Chip tone="neutral">{t('inactive')}</Chip>}
      front={
        <dl className="card-figures">
          <div className="card-figure">
            <dt>{t('projects')}</dt>
            <dd>{number(program.projects)}</dd>
          </div>
          <div className="card-figure">
            <dt>{t('running')}</dt>
            <dd>{number(program.runningProjects)}</dd>
          </div>
          <div className="card-figure">
            <dt>{t('people')}</dt>
            <dd>{number(program.beneficiaries)}</dd>
          </div>
        </dl>
      }
      backEyebrow={t('program_eyebrow')}
      back={
        <>
          {program.pm ? (
            <div className="card-person">
              <PersonAvatar fileId={null} name={program.pm.name} size="sm" />
              <div className="card-person-text">
                <strong>{program.pm.name}</strong>
                <span>{t('pm')}</span>
              </div>
            </div>
          ) : (
            <div>
              <Chip tone="warning">{t('no_pm')}</Chip>
            </div>
          )}
          <CardTeam rpms={program.rpms} />
          <dl className="card-blocks">
            <div className="card-block">
              <dt>{t('applications')}</dt>
              <dd>{number(program.applications)}</dd>
            </div>
            <div className="card-block">
              <dt>{t('volunteers')}</dt>
              <dd>{number(program.volunteers)}</dd>
            </div>
          </dl>
          {program.todo && <CardTodo todo={program.todo} />}
          {program.description && (
            <p className="card-description">{localized(program.description, locale)}</p>
          )}
          <div className="card-actions">
            <LinkButton to={projects} endIcon="arrow-right" fullWidth>
              {t('open_program')}
            </LinkButton>
            {onEdit && (
              <Button variant="secondary" fullWidth onClick={onEdit}>
                {t('edit_program')}
              </Button>
            )}
          </div>
        </>
      }
    />
  );
}
