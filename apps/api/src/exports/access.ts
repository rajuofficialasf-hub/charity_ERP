import { columnsOf, EXPORT_PERMISSION_OF_CLASS, type ExportList } from '@css/shared/exports';
import { holdsPermission } from '../access/scope';
import type { RequestAccess } from '../access/service';

/** The export permission each protected class needs beyond being seen. */
const NEEDS = new Map(Object.entries(EXPORT_PERMISSION_OF_CLASS));

/**
 * The protected field classes an export of this person may carry: those they see on screen, less
 * the identity numbers, bank details and official section their export permissions do not cover
 * (docs/security/RBAC.md, "Field-level protection"; the export service decision in
 * docs/DECISION_LOG.md).
 */
export function exportClasses(access: RequestAccess): Set<string> {
  const classes = new Set<string>();
  for (const cls of access.fieldClasses) {
    const needs = NEEDS.get(cls);
    if (!needs || holdsPermission(needs, access.grants)) classes.add(cls);
  }
  return classes;
}

/** The columns of a list this person may export: every column without a class, and those of theirs. */
export function exportableColumns(list: ExportList, classes: ReadonlySet<string>): string[] {
  return columnsOf(list)
    .filter((c) => c.cls === null || classes.has(c.cls))
    .map((c) => c.id);
}
