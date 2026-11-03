import { Card } from '@/ui';
import { useTranslations } from 'use-intl';
import type { ReactNode } from 'react';
import './auth-shell.css';
import { BrandPhoto } from './BrandPhoto';
import { TopBar } from './TopBar';

/**
 * Frame of the sign-in screens (SCR-001, mockup 01): logo, system name, one card, language; from
 * 1024 px the photo of the Foundation's building on the left, as on the registration page.
 */
export function AuthShell({ title, children }: { title: string; children: ReactNode }) {
  const t = useTranslations('common.app');
  return (
    <>
      <TopBar showBrand={false} />
      <div className="auth-layout">
        <BrandPhoto className="auth-photo" />
        <main id="main" className="auth-shell">
          {/* The organization's logo is an image of its name; the name follows as text. */}
          <img className="auth-shell-logo" src="/brand/logo.svg" alt="" width={113} height={72} />
          <div className="auth-shell-name">
            <h1>{t('name')}</h1>
            <p>{t('organization')}</p>
          </div>
          <div className="auth-shell-card">
            <Card title={title} headingLevel={2}>
              {children}
            </Card>
          </div>
        </main>
      </div>
    </>
  );
}
