import { useTranslations } from 'use-intl';
import './top-bar.css';
import { LanguageSwitch } from './LanguageSwitch';

/**
 * The slim bar at the top of the pages without a sidebar (UX-19): the system name at the start
 * when asked, the language toggle at the end.
 */
export function TopBar({ showBrand = true }: { showBrand?: boolean }) {
  const t = useTranslations('common.app');
  return (
    <header className="top-bar">
      {showBrand ? (
        <a href="/" className="top-bar-brand">
          <img src="/brand/logo.svg" alt="" width={36} height={23} />
          <span>{t('name')}</span>
        </a>
      ) : (
        <span />
      )}
      <LanguageSwitch />
    </header>
  );
}
