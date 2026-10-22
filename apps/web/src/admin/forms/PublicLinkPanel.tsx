import { Alert, CopyButton, ErrorState, Stack, Switch, Text, TextField } from '@css/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'use-intl';
import { ApiFailure } from '../../lib/api';
import { components, setupKey } from '../projects/setup/setup-api';
import { configurePublicLink } from './forms-api';

/** The link's settings as the component list keeps them; the token reaches its managers only. */
interface LinkSettings {
  token?: string;
  form_ids?: string[];
}

/**
 * The project's public application link from the builder of one form: whether the link is on and
 * opens this form, its URL to copy, and the switch that turns it on with this form or off. Every
 * switch-on makes a new URL and the old one stops working. Someone who does not manage the link
 * sees only whether it is on.
 */
export function PublicLinkPanel({
  projectId,
  formId,
  published,
  canManage,
}: {
  projectId: string;
  formId: string;
  /** Only a published form can be opened by the link. */
  published: boolean;
  canManage: boolean;
}) {
  const t = useTranslations('forms.builder.link');
  const queries = useQueryClient();
  const key = setupKey(projectId, 'components');
  const list = useQuery({ queryKey: key, queryFn: () => components(projectId) });
  const link = list.data?.find((c) => c.componentKey === 'public_link');
  const settings = (link?.settings ?? {}) as LinkSettings;
  const on = Boolean(link?.enabled);
  const here = on && (settings.form_ids ?? []).includes(formId);
  const toggle = useMutation({
    mutationFn: (enabled: boolean) =>
      configurePublicLink(projectId, enabled ? { enabled, formId } : { enabled }),
    onSuccess: () => queries.invalidateQueries({ queryKey: key }),
  });
  const url = here && settings.token ? `${window.location.origin}/apply/${settings.token}` : null;
  // without the link's state the panel says nothing and offers no switch: switching on would
  // replace a link that may be in use
  if (list.isError)
    return (
      <Stack as="section" gap={2} aria-label={t('title')}>
        <Text weight="bold">{t('title')}</Text>
        <ErrorState title={t('load_failed')} onRetry={() => void list.refetch()} />
      </Stack>
    );

  return (
    <Stack as="section" gap={2} aria-label={t('title')}>
      <Text weight="bold">{t('title')}</Text>
      <Text tone="muted">{here ? t('on_here') : on ? t('on_other') : t('off')}</Text>
      {toggle.error instanceof ApiFailure ? (
        <Alert tone="danger" live="alert">
          {toggle.error.details[0]?.message ?? toggle.error.message}
        </Alert>
      ) : null}
      {canManage ? (
        <Switch
          isSelected={here}
          isDisabled={toggle.isPending || !list.isSuccess || (!here && !published)}
          onChange={(next) => toggle.mutate(next)}
        >
          {t('switch')}
        </Switch>
      ) : null}
      {canManage && !published && !here ? <Text tone="muted">{t('publish_first')}</Text> : null}
      {url ? (
        <Stack direction="row" gap={1} align="end" wrap>
          <TextField label={t('url')} readOnly lang="en" value={url} />
          <CopyButton value={url} label={t('url')} />
        </Stack>
      ) : null}
      {canManage ? <Text tone="muted">{t('renew_note')}</Text> : null}
    </Stack>
  );
}
