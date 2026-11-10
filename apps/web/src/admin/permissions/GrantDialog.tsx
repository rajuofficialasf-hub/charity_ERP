import { SCOPE_TYPES, type ScopeTypeName } from '@css/shared/access';
import {
  Alert,
  Button,
  Combobox,
  DateField,
  Dialog,
  RadioGroup,
  SelectField,
  TextField,
} from '@/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { api, ApiFailure } from '../../api/client';
import type { PanelUser } from '../UserSearch';
import { permissionCatalogue } from './EffectivePermissions';

type Effect = 'grant' | 'revoke';
/**
 * Scopes without a reference (docs/security/RBAC.md, "Data scopes and their resolution"); every
 * other scope names a program, project or location.
 */
const UNBOUND: readonly ScopeTypeName[] = ['GLOBAL', 'SELF', 'ASSIGNED'];
/** Detail paths shown at their field; any other answer is shown above the form. */
const FIELD_PATHS = ['permission', 'scopeRef', 'reason', 'expiresAt'];

/**
 * Grant or remove a permission for one user at a scope, with a reason and an optional expiry
 * (POST /permission-grants). A refused change shows the server's message.
 */
export function GrantDialog({
  user,
  open,
  onClose,
  onDone,
}: {
  user: PanelUser;
  open: boolean;
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
    enabled: open,
  });
  const save = useMutation({
    mutationFn: () =>
      api<unknown>('/permission-grants', {
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
    <Dialog
      title={t('grant')}
      open={open}
      onClose={close}
      dismissible={!save.isPending}
      actions={
        <>
          <Button variant="secondary" onClick={close} disabled={save.isPending}>
            {tc('cancel')}
          </Button>
          <Button onClick={() => save.mutate()} disabled={!ready} loading={save.isPending}>
            {effect === 'grant' ? t('dialog.submit_grant') : t('dialog.submit_revoke')}
          </Button>
        </>
      }
    >
      {failure &&
        (failure.details.length === 0 ||
          failure.details.some((d) => !FIELD_PATHS.includes(d.path ?? ''))) && (
          <Alert tone="error">{failure.message}</Alert>
        )}
      <RadioGroup
        label={t('dialog.effect')}
        orientation="horizontal"
        value={effect}
        onChange={(id) => setEffect(id as Effect)}
        options={[
          { value: 'grant', label: t('dialog.effect_grant') },
          { value: 'revoke', label: t('dialog.effect_revoke') },
        ]}
      />
      <Combobox
        label={t('dialog.permission')}
        required
        options={(permissions.data ?? []).map((p) => ({ value: p.name, label: p.name }))}
        value={permission}
        onChange={setPermission}
        error={detail('permission')}
      />
      <SelectField
        label={t('dialog.scope')}
        required
        value={scopeType}
        onChange={(id) => id && setScopeType(id as ScopeTypeName)}
        options={SCOPE_TYPES.map((s) => ({ value: s, label: t(`scope.${s}`) }))}
        searchable={false}
      />
      {!UNBOUND.includes(scopeType) && (
        <TextField
          label={t('dialog.scope_ref')}
          hint={t('dialog.scope_ref_hint')}
          required
          value={scopeRef}
          onChange={setScopeRef}
          error={detail('scopeRef')}
        />
      )}
      <TextField
        rows={4}
        label={t('dialog.reason')}
        hint={t('dialog.reason_hint')}
        required
        maxLength={1000}
        value={reason}
        onChange={setReason}
        error={detail('reason')}
      />
      <DateField
        label={t('dialog.expires')}
        hint={t('dialog.expires_hint')}
        value={expires ?? ''}
        onChange={(iso) => setExpires(iso || null)}
        error={detail('expiresAt')}
      />
    </Dialog>
  );
}
