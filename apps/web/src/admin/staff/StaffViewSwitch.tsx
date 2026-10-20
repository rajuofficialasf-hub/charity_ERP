import { SegmentedControl } from '@css/ui';
import { useNavigate } from 'react-router';
import { useTranslations } from 'use-intl';

const VIEWS = { list: '/admin/staff', chart: '/admin/staff/organogram' } as const;
export type StaffView = keyof typeof VIEWS;

/** The two views of the officials, the list and the organogram, one press apart. */
export function StaffViewSwitch({ value }: { value: StaffView }) {
  const t = useTranslations('admin.staff.view');
  const navigate = useNavigate();
  return (
    <SegmentedControl
      label={t('label')}
      value={value}
      onChange={(id) => void navigate(id === 'chart' ? VIEWS.chart : VIEWS.list)}
      options={[
        { id: 'list', label: t('list') },
        { id: 'chart', label: t('chart') },
      ]}
    />
  );
}
