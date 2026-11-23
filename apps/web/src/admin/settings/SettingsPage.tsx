import { Alert, Page, Skeleton, Tabs } from '@/ui';
import { useQuery } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useTranslations } from 'use-intl';
import { DocumentTitle } from '../../components/DocumentTitle';
import { useAuth } from '../../lib/auth';
import { ForbiddenContent } from '../AdminLayout';
import { canAdministerSystem, canKeepOfficeAddresses } from '../roles';
import { ChannelsPanel } from './ChannelsPanel';
import { ListsPanel } from './ListsPanel';
import { OfficeAddressesPanel } from './OfficeAddressesPanel';
import { LanguageForm, OrganisationForm, ThresholdsForm } from './SettingsForms';
import { type GeneralSettings, SETTINGS_KEY, settings } from './settings-api';
import { LoadError } from '../../components/LoadError';

const TABS = ['organisation', 'language', 'thresholds', 'lists', 'channels', 'security'] as const;
type Tab = (typeof TABS)[number];

/**
 * The settings of the system (docs/DECISION_LOG.md, the admin and settings decision of
 * 2026-10-17) for the Department Head and the Monitoring Team: the organisation, the default
 * language, the alert thresholds, the expense category and issue type lists, the notification
 * channels with the dummy OTP warning and, for an Admin alone, the office addresses the rate limits
 * exempt. The tab stays in the address. The server checks every write.
 */
export function SettingsPage() {
  const { me } = useAuth();
  const t = useTranslations('admin.settings');
  const [params, setParams] = useSearchParams();
  const asked = params.get('tab');
  // the office addresses are the Admin's alone; the Head never sees the tab
  const tabs = TABS.filter((id) => id !== 'security' || (me && canKeepOfficeAddresses(me)));
  const tab: Tab = (tabs as readonly string[]).includes(asked ?? '')
    ? (asked as Tab)
    : 'organisation';
  const [notice, setNotice] = useState<string>();
  const allowed = Boolean(me && canAdministerSystem(me));
  const all = useQuery({ queryKey: SETTINGS_KEY, queryFn: settings, enabled: allowed });
  if (!me) return null;
  if (!allowed) return <ForbiddenContent />;

  const saved = () => setNotice(t('saved'));
  const withSettings = (render: (s: GeneralSettings) => ReactNode) => {
    if (all.isPending) return <Skeleton count={4} />;
    if (all.error) return <LoadError error={all.error} onRetry={() => void all.refetch()} />;
    return render(all.data);
  };
  const content: Record<Tab, ReactNode> = {
    organisation: withSettings((s) => (
      <OrganisationForm key={s.organisation.updatedAt} entry={s.organisation} onSaved={saved} />
    )),
    language: withSettings((s) => (
      <LanguageForm key={s.localization.updatedAt} entry={s.localization} onSaved={saved} />
    )),
    thresholds: withSettings((s) => (
      <ThresholdsForm
        key={s['monitoring.thresholds'].updatedAt}
        entry={s['monitoring.thresholds']}
        onSaved={saved}
      />
    )),
    lists: <ListsPanel onNotice={setNotice} />,
    channels: <ChannelsPanel onSaved={saved} />,
    security: <OfficeAddressesPanel onSaved={saved} />,
  };

  return (
    <>
      <DocumentTitle title={t('title')} />
      <Page
        eyebrow={t('eyebrow')}
        title={t('title')}
        description={t('description')}
        documentTitle={false}
      />
      {notice && (
        <Alert tone="success" onDismiss={() => setNotice(undefined)}>
          {notice}
        </Alert>
      )}
      <Tabs
        label={t('tabs_label')}
        value={tab}
        onChange={(id) => {
          setNotice(undefined);
          setParams({ tab: id }, { replace: true });
        }}
        items={tabs.map((id) => ({
          value: id,
          label: t(`tab.${id}`),
          // eslint-disable-next-line security/detect-object-injection -- id is a Tab
          content: content[id],
        }))}
      />
    </>
  );
}
