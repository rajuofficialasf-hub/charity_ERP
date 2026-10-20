import { Button, type IconComponent } from '@css/ui';
import { ArrowLeft, Save } from 'lucide-react';
import { useTranslations } from 'use-intl';

/**
 * The action bar under a wizard step, kept in view at the bottom: Back, save and exit, and the
 * step's main action (Next, create, activate). On a phone the buttons fill the width.
 */
export function WizardActions({
  onBack,
  onSaveExit,
  saveExitLabel,
  primary,
  busy,
}: {
  onBack?: () => void;
  onSaveExit?: () => void;
  saveExitLabel: string;
  primary?: { label: string; icon: IconComponent; onPress: () => void };
  /** A save or a move is running: every button waits. */
  busy: boolean;
}) {
  const t = useTranslations('admin.projects.wizard');
  return (
    <div className="admin-wizard-actions">
      <div className="admin-wizard-actions-start">
        {onBack && (
          <Button variant="secondary" icon={ArrowLeft} onPress={onBack} disabled={busy}>
            {t('back')}
          </Button>
        )}
      </div>
      <div className="admin-wizard-actions-end">
        {onSaveExit && (
          <Button variant="ghost" icon={Save} onPress={onSaveExit} disabled={busy}>
            {saveExitLabel}
          </Button>
        )}
        {primary && (
          <Button icon={primary.icon} iconPosition="end" onPress={primary.onPress} loading={busy}>
            {primary.label}
          </Button>
        )}
      </div>
    </div>
  );
}
