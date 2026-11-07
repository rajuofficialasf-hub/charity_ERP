import { Button, type ExtendedIconName } from '@/ui';
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
  primary?: { label: string; icon: ExtendedIconName; onPress: () => void };
  /** A save or a move is running: every button waits. */
  busy: boolean;
}) {
  const t = useTranslations('admin.projects.wizard');
  return (
    <div className="admin-wizard-actions">
      <div className="admin-wizard-actions-start">
        {onBack && (
          <Button variant="secondary" startIcon="arrow-left" onClick={onBack} disabled={busy}>
            {t('back')}
          </Button>
        )}
      </div>
      <div className="admin-wizard-actions-end">
        {onSaveExit && (
          <Button variant="text" startIcon="save" onClick={onSaveExit} disabled={busy}>
            {saveExitLabel}
          </Button>
        )}
        {primary && (
          <Button endIcon={primary.icon} onClick={primary.onPress} loading={busy}>
            {primary.label}
          </Button>
        )}
      </div>
    </div>
  );
}
