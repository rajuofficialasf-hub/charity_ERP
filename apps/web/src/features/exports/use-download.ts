import { useState } from 'react';
import { downloadExport, type ExportJob } from './exports-api';

/** Saves a finished export, with its busy and failed states for the button beside it. */
export function useDownload() {
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const save = async (job: ExportJob) => {
    setSaving(true);
    setSaveFailed(false);
    try {
      await downloadExport(job);
    } catch {
      setSaveFailed(true);
    } finally {
      setSaving(false);
    }
  };
  return { save, saving, saveFailed };
}
