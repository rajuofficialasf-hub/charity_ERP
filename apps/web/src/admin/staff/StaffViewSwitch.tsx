import { RadioGroup } from '@/ui';
import { useNavigate } from 'react-router';
import { useTranslations } from 'use-intl';

const VIEWS = { list: '/admin/staff', chart: '/admin/staff/organogram' } as const;
export type StaffView = keyof typeof VIEWS;

/** The two views of the officials, the list and the organogram, one press apart. */
export function StaffViewSwitch({ value }: { value: StaffView }) {
  const t = useTranslations('admin.staff.view');
  const navigate = useNavigate();
  return (
    <RadioGroup
      label={t('label')}
      orientation="horizontal"
      value={value}
      onChange={(id) => void navigate(id === 'chart' ? VIEWS.chart : VIEWS.list)}
      options={[
        { value: 'list', label: t('list') },
        { value: 'chart', label: t('chart') },
      ]}
    />
  );
}
