import { formatCount, formatTaka } from '@css/shared/format';
import type { Locale } from '@css/shared/i18n';
import { useLocale, useTranslations } from 'use-intl';
import type { CardPeople } from '../../api/schemas';
import { PersonAvatar } from '../../components/PersonPhoto';

/**
 * The RPMs on a card's back: up to three photos and how many there are, or that none is given
 * yet (docs/ui/SCREENS.md, "Project list and project page").
 */
export function CardTeam({ rpms }: { rpms: CardPeople }) {
  const t = useTranslations('admin.projects.cards');
  const locale = useLocale() as Locale;
  return (
    <div className="card-team">
      {rpms.total > 0 ? (
        <>
          <span className="card-team-photos">
            {rpms.people.map((person) => (
              <PersonAvatar
                key={person.id}
                fileId={person.photoFileId}
                name={person.name}
                size="sm"
              />
            ))}
          </span>
          <span>{t('rpms', { count: formatCount(rpms.total, locale) })}</span>
        </>
      ) : (
        <span>{t('no_rpms')}</span>
      )}
    </div>
  );
}

/**
 * "আপনার করণীয়" on a card's back: the reviews waiting and the waitlist of what the caller's own
 * scope reaches, and the budget only when the read gives it (the caller may see the budget).
 */
export function CardTodo({
  todo,
}: {
  todo: { reviewsWaiting: number; waitlisted: number; budgetPlanned?: string | null };
}) {
  const t = useTranslations('admin.projects.cards');
  const ts = useTranslations('admin.projects.series_card');
  const locale = useLocale() as Locale;
  return (
    <section className="card-todo" aria-label={t('todo')}>
      <span className="card-todo-title">{t('todo')}</span>
      <dl className="card-todo-items">
        <div>
          <dt>{t('reviews_waiting')}</dt>
          <dd>{formatCount(todo.reviewsWaiting, locale)}</dd>
        </div>
        <div>
          <dt>{t('waitlisted')}</dt>
          <dd>{formatCount(todo.waitlisted, locale)}</dd>
        </div>
        {todo.budgetPlanned !== null && todo.budgetPlanned !== undefined && (
          <div>
            <dt>{ts('budget')}</dt>
            <dd>{formatTaka(Number(todo.budgetPlanned), locale)}</dd>
          </div>
        )}
      </dl>
    </section>
  );
}
