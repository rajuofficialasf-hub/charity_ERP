import { PERMISSIONS_PER_REQUEST, SCOPE_TYPES, type ScopeTypeName } from '@css/shared/access';
import { localized, type Locale } from '@css/shared/i18n';
import {
  Alert,
  Button,
  Combobox,
  Dialog,
  Form,
  FormDateField,
  FormTextField,
  IconButton,
  RadioGroup,
  SelectField,
} from '@/ui';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useLocale, useTranslations } from 'use-intl';
import { z } from 'zod';
import { api } from '../../api/client';
import { LoadError } from '../../components/LoadError';
import { showFailure, useSchemaResolver } from '../../lib/form-schema';
import type { PanelUser } from '../UserSearch';
import { PERMISSIONS_KEY, permissionCatalogue } from './catalogue';
import { ScopePicker } from './ScopePicker';

type Effect = 'grant' | 'revoke';
/**
 * Scopes without a reference (docs/security/RBAC.md, "Data scopes and their resolution"); every
 * other scope names a program, project or location, chosen by name.
 */
const UNBOUND: readonly ScopeTypeName[] = ['GLOBAL', 'SELF', 'ASSIGNED'];

/**
 * One permission at least and twenty at most, a reason of three letters at least and, for a scope
 * that names something, the one chosen; the server checks the rest. `expiresAt` holds the last
 * day, sent as its end in Dhaka.
 */
const GRANT_SCHEMA = z
  .object({
    effect: z.enum(['grant', 'revoke']),
    permissions: z.array(z.string()).max(PERMISSIONS_PER_REQUEST),
    scopeType: z.enum(SCOPE_TYPES),
    scopeRef: z.string(),
    reason: z.string(),
    expiresAt: z.string(),
  })
  .superRefine((v, ctx) => {
    if (v.permissions.length === 0)
      ctx.addIssue({ code: 'custom', path: ['permissions'], message: 'validation.required' });
    if (!UNBOUND.includes(v.scopeType) && !v.scopeRef.trim())
      ctx.addIssue({ code: 'custom', path: ['scopeRef'], message: 'validation.required' });
    if (v.reason.trim().length < 3)
      ctx.addIssue({ code: 'custom', path: ['reason'], message: 'validation.too_short' });
  });
type GrantFields = z.infer<typeof GRANT_SCHEMA>;
const EMPTY: GrantFields = {
  effect: 'grant',
  permissions: [],
  scopeType: 'GLOBAL',
  scopeRef: '',
  reason: '',
  expiresAt: '',
};

/**
 * Gives or takes away one or more permissions for one user at a scope, under one reason and an
 * optional expiry (POST /permission-grants; docs/ui/SCREENS.md "Permission panel"): each permission
 * found by its Bengali or English name or its code, the scope's program, project or place chosen
 * by name. A refused change shows the server's message, and nothing of it is written.
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
  const ts = useTranslations('common.state.error');
  const locale = useLocale() as Locale;
  const form = useForm<GrantFields>({
    resolver: useSchemaResolver(GRANT_SCHEMA),
    defaultValues: EMPTY,
    reValidateMode: 'onSubmit',
  });
  const values = useWatch({ control: form.control });
  const ready = GRANT_SCHEMA.safeParse(values).success;
  const pending = form.formState.isSubmitting;
  const error = form.formState.errors.root?.server?.message;

  const permissions = useQuery({
    queryKey: PERMISSIONS_KEY,
    queryFn: permissionCatalogue,
    enabled: open,
  });
  // the box is drawn anew after each choice to empty its text; the focus goes back into it, so
  // the next permission is typed at once
  const addBox = useRef<HTMLDivElement>(null);
  const picked = useRef(false);
  const chosenCount = values.permissions?.length ?? 0;
  useEffect(() => {
    if (!picked.current) return;
    picked.current = false;
    addBox.current?.querySelector('input')?.focus();
  }, [chosenCount]);
  const full = chosenCount >= PERMISSIONS_PER_REQUEST;
  const nameOf = (code: string) => {
    const def = permissions.data?.find((p) => p.name === code);
    return def ? localized(def.title, locale) : code;
  };

  const save = async (v: GrantFields) => {
    try {
      await api<unknown>('/permission-grants', {
        method: 'POST',
        body: {
          userId: user.id,
          permissions: v.permissions,
          effect: v.effect,
          scopeType: v.scopeType,
          ...(UNBOUND.includes(v.scopeType) ? {} : { scopeRef: v.scopeRef }),
          reason: v.reason.trim(),
          ...(v.expiresAt ? { expiresAt: `${v.expiresAt}T23:59:59+06:00` } : {}),
        },
      });
    } catch (failure) {
      // a detail no field shows is said above the form, beside the ones at their fields
      showFailure(form, failure, ts('text'), { everyDetail: true });
      return;
    }
    form.reset(EMPTY);
    onDone(v.effect);
  };
  const close = () => {
    form.reset(EMPTY);
    onClose();
  };

  return (
    <Dialog
      title={t('grant')}
      open={open}
      onClose={close}
      dismissible={!pending}
      actions={
        <>
          <Button variant="secondary" onClick={close} disabled={pending}>
            {tc('cancel')}
          </Button>
          <Button
            onClick={() => void form.handleSubmit(save)()}
            disabled={!ready}
            loading={pending}
          >
            {values.effect === 'revoke' ? t('dialog.submit_revoke') : t('dialog.submit_grant')}
          </Button>
        </>
      }
    >
      <Form form={form} onSubmit={save} label={t('grant')}>
        {error && <Alert tone="error">{error}</Alert>}
        <Controller
          control={form.control}
          name="effect"
          render={({ field, fieldState }) => (
            <RadioGroup
              label={t('dialog.effect')}
              orientation="horizontal"
              value={field.value}
              onChange={(id) => field.onChange(id as Effect)}
              error={fieldState.error?.message}
              options={[
                { value: 'grant', label: t('dialog.effect_grant') },
                { value: 'revoke', label: t('dialog.effect_revoke') },
              ]}
            />
          )}
        />
        <Controller
          control={form.control}
          name="permissions"
          render={({ field, fieldState }) => (
            <div className="admin-panel-section" ref={addBox}>
              {permissions.error ? (
                <LoadError error={permissions.error} onRetry={() => void permissions.refetch()} />
              ) : (
                <Combobox
                  // a new box after each choice, so its text is empty for the next one
                  key={field.value.join('|')}
                  label={t('dialog.add')}
                  hint={
                    full
                      ? t('dialog.limit', { max: PERMISSIONS_PER_REQUEST })
                      : t('dialog.add_hint')
                  }
                  // full, the box takes no more until one is removed
                  disabled={full}
                  loading={permissions.isPending}
                  // each choice joins the list below, and the box is free for the next one
                  value={null}
                  onChange={(code) => {
                    if (code && !field.value.includes(code) && !full) {
                      picked.current = true;
                      field.onChange([...field.value, code]);
                    }
                  }}
                  onBlur={field.onBlur}
                  options={(permissions.data ?? [])
                    .filter((p) => !field.value.includes(p.name))
                    .map((p) => ({
                      value: p.name,
                      label: `${localized(p.title, locale)} · ${p.name}`,
                    }))}
                  error={fieldState.error ? t('dialog.none_chosen') : undefined}
                />
              )}
              {field.value.length > 0 && (
                <ul className="admin-plain-list" aria-label={t('dialog.chosen')}>
                  {field.value.map((code) => (
                    <li key={code} className="admin-permission-name">
                      <span>{nameOf(code)}</span> <code>{code}</code>{' '}
                      <IconButton
                        icon="close"
                        label={t('dialog.remove', { permission: nameOf(code) })}
                        onClick={() => field.onChange(field.value.filter((c) => c !== code))}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        />
        <Controller
          control={form.control}
          name="scopeType"
          render={({ field, fieldState }) => (
            <SelectField
              label={t('dialog.scope')}
              required
              value={field.value}
              onChange={(id) => {
                if (!id) return;
                // the instance belongs to the type it was chosen for
                field.onChange(id as ScopeTypeName);
                form.setValue('scopeRef', '');
              }}
              options={SCOPE_TYPES.map((s) => ({ value: s, label: t(`scope.${s}`) }))}
              searchable={false}
              error={fieldState.error?.message}
            />
          )}
        />
        {values.scopeType && !UNBOUND.includes(values.scopeType) && (
          <Controller
            control={form.control}
            name="scopeRef"
            render={({ field, fieldState }) => (
              <ScopePicker
                key={values.scopeType}
                scopeType={values.scopeType!}
                onChange={field.onChange}
                error={fieldState.error ? t('dialog.ref_required') : undefined}
              />
            )}
          />
        )}
        <FormTextField
          name="reason"
          rows={4}
          label={t('dialog.reason')}
          hint={t('dialog.reason_hint')}
          required
          maxLength={1000}
        />
        <FormDateField
          name="expiresAt"
          label={t('dialog.expires')}
          hint={t('dialog.expires_hint')}
        />
      </Form>
    </Dialog>
  );
}
