import { useQuery } from '@tanstack/react-query';
import { EXPORTS_KEY, exportJob, type ExportJob } from './exports-api';

/** How often a waiting or running job is asked again. */
const POLL_MS = 2000;

/** A job followed until it ends: asked again every two seconds while it waits or runs. */
export function useExportJob(id: string | null) {
  return useQuery({
    queryKey: [...EXPORTS_KEY, 'job', id],
    queryFn: () => exportJob(id!),
    enabled: id !== null,
    refetchInterval: (query) => {
      // a job that cannot be read is not asked again until the person retries
      if (query.state.status === 'error') return false;
      const status = (query.state.data as ExportJob | undefined)?.status;
      return status === 'done' || status === 'failed' ? false : POLL_MS;
    },
  });
}
