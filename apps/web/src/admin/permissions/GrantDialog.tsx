import { SCOPE_TYPES, type ScopeTypeName } from '@css/shared/access';
import {
  Alert,
  Button,
  Combobox,
  DateField,
  Modal,
  RadioGroup,
  Select,
  TextArea,
  TextField,
} from '@css/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { api, ApiFailure } from '../../lib/api';
import { type PanelUser, permissionCatalogue } from './EffectivePermissions';

type Effect = 'grant' | 'revoke';
/** Scopes without a reference (RBAC.md 4); every other scope names a program, project or location. */
const UNBOUND: readonly ScopeTypeName[] = ['GLOBAL', 'SELF', 'ASSIGNED'];
/** Detail paths shown at their field; any other answer is shown above the form. */
const FIELD_PATHS = ['permission', 'scopeRef', 'reason', 'expiresAt'];

/**
 * Grant or remove a permission for one user at a scope, with a reason and an optional expiry
 * (POST /permission-grants). A refused change shows the server's message (D-078).
 */
export function GrantDialog({
  user,
  isOpen,
  onClose,
  onDone,
}: {
  user: PanelUser;
  isOpen: boolean;
  onClose: () => void;
  onDone: (effect: Effect) => void;
}) {
  const t = useTranslations('admin.permissions');
  const tc = useTranslations('common.action');
  const [effect, setEffect] = useState<Effect>('grant');
  const [permission, setPermission] = useState<string | null>(null);
  const [scopeType, setScopeType] = useState<ScopeTypeName>('GLOBAL');
  const [scopeRef, setScopeRef] = useState('');
  const [reason, setReason] = useState('');
  const [expires, setExpires] = useState<string | null>(null);

  const permissions = useQuery({
    queryKey: ['admin', 'permissions'],
    queryFn: permissionCatalogue,
    enabled: isOpen,
  });
  const save = useMutation({
    mutationFn: () =>
      api('/permission-grants', {
        method: 'POST',
        body: {
          userId: user.id,
          permission,
          effect,
          scopeType,
          ...(UNBOUND.includes(scopeType) ? {} : { scopeRef: scopeRef.trim() }),
          reason: reason.trim(),
          ...(expires ? { expiresAt: `${expires}T23:59:59+06:00` } : {}),
        },
      }),
    onSuccess: () => {
      reset();
      onDone(effect);
    },
  });
  const reset = () => {
    setEffect('grant');
    setPermission(null);
    setScopeType('GLOBAL');
    setScopeRef('');
    setReason('');
    setExpires(null);
    save.reset();
  };
  const close = () => {
    reset();
    onClose();
  };
  const failure = save.error instanceof ApiFailure ? save.error : null;
  const detail = (path: string) => failure?.details.find((d) => d.path === path)?.message;
  const ready =
    permission !== null &&
    reason.trim().length >= 3 &&
    (UNBOUND.includes(scopeType) || scopeRef.trim().length > 0);

  return (
    <Modal
      title={t('grant')}
      isOpen={isOpen}
      onClose={close}
      dismissible={!save.isPending}
      secondaryAction={
        <Button variant="secondary" onPress={close} disabled={save.isPending}>
          {tc('cancel')}
        </Button>
      }
      primaryAction={
        <Button onPress={() => save.mutate()} disabled={!ready} loading={save.isPending}>
          {effect === 'grant' ? t('dialog.submit_grant') : t('dialog.submit_revoke')}
        </Button>
      }
    >
      {failure &&
        (failure.details.length === 0 ||
          failure.details.some((d) => !FIELD_PATHS.includes(d.path ?? ''))) && (
          <Alert tone="danger" live="alert">
            {failure.message}
          </Alert>
        )}
      <RadioGroup
        label={t('dialog.effect')}
        orientation="horizontal"
        value={effect}
        onChange={(id) => setEffect(id as Effect)}
        options={[
          { id: 'grant', label: t('dialog.effect_grant') },
          { id: 'revoke', label: t('dialog.effect_revoke') },
        ]}
      />
      <Combobox
        label={t('dialog.permission')}
        required
        options={(permissions.data ?? []).map((p) => ({ id: p.name, label: p.name }))}
        value={permission}
        onChange={setPermission}
        error={detail('permission')}
      />
      <Select
        label={t('dialog.scope')}
        required
        value={scopeType}
        onChange={(id) => id && setScopeType(id as ScopeTypeName)}
        options={SCOPE_TYPES.map((s) => ({ id: s, label: t(`scope.${s}`) }))}
        searchable={false}
      />
      {!UNBOUND.includes(scopeType) && (
        <TextField
          label={t('dialog.scope_ref')}
          helper={t('dialog.scope_ref_hint')}
          required
          value={scopeRef}
          onChange={setScopeRef}
          error={detail('scopeRef')}
        />
      )}
      <TextArea
        label={t('dialog.reason')}
        helper={t('dialog.reason_hint')}
        required
        maxLength={1000}
        value={reason}
        onChange={setReason}
        error={detail('reason')}
      />
      <DateField
        label={t('dialog.expires')}
        helper={t('dialog.expires_hint')}
        value={expires}
        onChange={setExpires}
        error={detail('expiresAt')}
      />
    </Modal>
  );
}
