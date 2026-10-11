import { Card } from '@css/ui';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import './auth-shell.css';
import { LanguageSwitch } from './LanguageSwitch';

/** Frame of the sign-in screens (SCR-001, mockup 01): logo, system name, one card, language. */
export function AuthShell({ title, children }: { title: string; children: ReactNode }) {
  const t = useTranslations('common.app');
  return (
    <main id="main" className="auth-shell">
      {/* The organization's logo is an image of its name; the name follows as text. */}
      <Image
        className="auth-shell-logo"
        src="/brand/logo.svg"
        alt=""
        width={113}
        height={72}
        priority
        unoptimized
      />
      <div className="auth-shell-name">
        <h1>{t('name')}</h1>
        <p>{t('organization')}</p>
      </div>
      <Card title={title} headingLevel={2} className="auth-shell-card">
        {children}
      </Card>
      <div className="auth-shell-foot">
        <LanguageSwitch />
      </div>
    </main>
  );
}
