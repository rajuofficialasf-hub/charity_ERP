import type { ExportList } from '@css/shared/exports';
import { Button, Stack } from '@/ui';
import { lazy, Suspense, useState } from 'react';
import { useTranslations } from 'use-intl';
import { canExport } from '../../admin/roles';
import { useAuth } from '../../lib/auth';

// the dialog and its column picker load only when someone opens them
const ExportDialog = lazy(() => import('./ExportDialog'));

interface ExportButtonProps {
  list: ExportList;
  projectId?: string;
  /** The list's filters and search as the page holds them now. */
  filters: Record<string, string | undefined>;
}

/**
 * "Export" on a list, for the roles that hold the lists' export; the server checks the permission,
 * its scope and every protected column again.
 */
export function ExportButton({ list, projectId, filters }: ExportButtonProps) {
  const t = useTranslations('exports.dialog');
  const { me } = useAuth();
  const [open, setOpen] = useState(false);
  if (!me || !canExport(me)) return null;
  return (
    <Stack direction="row" justify="end">
      <Button variant="secondary" startIcon="file-download" onClick={() => setOpen(true)}>
        {t('open')}
      </Button>
      {open && (
        <Suspense fallback={null}>
          <ExportDialog
            list={list}
            {...(projectId ? { projectId } : {})}
            filters={filters}
            onClose={() => setOpen(false)}
          />
        </Suspense>
      )}
    </Stack>
  );
}
