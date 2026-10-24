import { useQuery } from '@tanstack/react-query';
import {
  FORMS_KEY,
  formVersions,
  type FormKind,
  LIBRARY_KEY,
  library,
  projectForms,
  READY_KEY,
  readyForms,
} from './forms-api';

/** Where the builder's form lives: on a project, among the ready forms, or the question library. */
export type BuilderScope = 'project' | 'ready' | 'library';

/** What the builder page needs of its form, wherever it lives. */
export interface FormSummary {
  id: string;
  /** Null for the library, which takes its name from the screen's texts. */
  title: { bn: string; en: string } | null;
  kind: FormKind | 'library';
  publishedVersionId: string | null;
  draftVersionId: string | null;
  /** A form placed from a ready form; it changes only by taking a newer version. */
  sourceFormId: string | null;
  newerVersionNo: number | null;
}

/**
 * The builder's form: a project's form from the project's list, a ready form from the ready
 * forms, the library from the library read and its versions. `found` is false once the reads
 * are done and the form is not among them.
 */
export function useFormSummary(scope: BuilderScope, projectId: string, routeFormId: string) {
  const project = useQuery({
    queryKey: [...FORMS_KEY, projectId],
    queryFn: () => projectForms(projectId),
    enabled: scope === 'project',
  });
  const ready = useQuery({ queryKey: READY_KEY, queryFn: readyForms, enabled: scope === 'ready' });
  const lib = useQuery({ queryKey: LIBRARY_KEY, queryFn: library, enabled: scope === 'library' });
  const libraryId = lib.data?.libraryFormId ?? '';
  const libVersions = useQuery({
    queryKey: [...FORMS_KEY, 'versions', libraryId],
    queryFn: () => formVersions(libraryId),
    enabled: scope === 'library' && libraryId !== '',
  });
  const reads = scope === 'project' ? [project] : scope === 'ready' ? [ready] : [lib, libVersions];
  const error = reads.find((r) => r.error)?.error ?? null;
  // a query that waits on a failed one stays pending, so a failure ends the wait
  const isPending = !error && reads.some((r) => r.isPending);
  const refetch = () => reads.forEach((r) => void r.refetch());

  let summary: FormSummary | undefined;
  if (scope === 'project') {
    const f = project.data?.find((x) => x.id === routeFormId);
    if (f)
      summary = {
        id: f.id,
        title: f.title,
        kind: f.kind,
        publishedVersionId: f.publishedVersionId,
        draftVersionId: f.draftVersionId,
        sourceFormId: f.sourceFormId,
        newerVersionNo: f.newerVersionNo,
      };
  } else if (scope === 'ready') {
    const f = ready.data?.find((x) => x.id === routeFormId);
    if (f)
      summary = {
        id: f.id,
        title: f.title,
        kind: f.kind,
        publishedVersionId: f.publishedVersionId,
        draftVersionId: f.draftVersionId,
        sourceFormId: null,
        newerVersionNo: null,
      };
  } else if (libVersions.data) {
    summary = {
      id: libraryId,
      title: null,
      kind: 'library',
      publishedVersionId: libVersions.data.find((v) => v.status === 'published')?.id ?? null,
      draftVersionId: libVersions.data.find((v) => v.status === 'draft')?.id ?? null,
      sourceFormId: null,
      newerVersionNo: null,
    };
  }
  return {
    summary,
    found: !isPending && !error && summary !== undefined,
    isPending,
    error,
    refetch,
  };
}
