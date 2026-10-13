import { useId } from 'react';
import { useTranslations } from 'use-intl';
import type { LucideIcon } from 'lucide-react';

/** The sections of the profile as a list of buttons: one open at a time (UX-18, T1.9d). */
export function ProfileNav({
  sections,
  current,
  waiting,
  onSelect,
}: {
  sections: { key: string; title: string; icon: LucideIcon }[];
  current: string;
  /** Sections with a request waiting for the person (a code or a photo to give). */
  waiting: ReadonlySet<string>;
  onSelect: (key: string) => void;
}) {
  const t = useTranslations('registration.profile');
  const id = useId();
  return (
    <nav aria-label={t('nav_label')} className="profile-nav">
      {sections.map(({ key, title, icon: Icon }) => {
        const attention = waiting.has(key);
        return (
          <button
            key={key}
            type="button"
            className="profile-nav-item"
            aria-current={current === key ? 'true' : undefined}
            aria-describedby={attention ? `${id}-${key}` : undefined}
            onClick={() => onSelect(key)}
          >
            <Icon size={18} aria-hidden="true" />
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
