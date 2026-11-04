import { type ExtendedIconName, Icon } from '@/ui';
import { useId } from 'react';
import { useTranslations } from 'use-intl';

/** The sections of the profile as a list of buttons: one open at a time (UX-18, T1.9d). */
export function ProfileNav<Key extends string>({
  sections,
  current,
  waiting,
  busy,
  onSelect,
}: {
  sections: { key: Key; title: string; icon: ExtendedIconName }[];
  current: Key;
  /** Sections with a request waiting for the person (a code or a photo to give). */
  waiting: ReadonlySet<Key>;
  /** A send is running: the section can not be left meanwhile. */
  busy: boolean;
  onSelect: (key: Key) => void;
}) {
  const t = useTranslations('registration.profile');
  const id = useId();
  return (
    <nav aria-label={t('nav_label')} className="profile-nav">
      {sections.map(({ key, title, icon }) => {
        const attention = waiting.has(key);
        return (
          <button
            key={key}
            type="button"
            className="profile-nav-item"
            disabled={busy && current !== key}
            aria-current={current === key ? 'true' : undefined}
            aria-describedby={attention ? `${id}-${key}` : undefined}
            onClick={() => onSelect(key)}
          >
            <Icon name={icon} size={18} />
            <span>{title}</span>
            {attention && (
              <>
                <span className="profile-nav-dot" aria-hidden="true" />
                <span id={`${id}-${key}`} hidden>
                  {t('edit.status.open')}
                </span>
              </>
            )}
          </button>
        );
      })}
    </nav>
  );
}
