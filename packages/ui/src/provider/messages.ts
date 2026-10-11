/**
 * The design system's own texts (screen-reader names, state words, pager words). packages/ui ships
 * no text: the app passes these messages in both languages through UiProvider (constitution §11,
 * I18N.md). T1.5 moves the values into the `ui` namespace of the message catalogue.
 *
 * Placeholders use `{name}` and receive already formatted values (numbers through the app's
 * formatter, so digits stay English, UX-05).
 */
export interface UiMessages {
  common: {
    close: string;
    cancel: string;
    loading: string;
    retry: string;
    dismiss: string;
    back: string;
    /** "{label}, {count} pending" style name for counts in nav items and tabs. */
    countName: string;
  };
  field: {
    /** Text mark after a required label, e.g. "(required)". */
    required: string;
    locked: string;
    requestCorrection: string;
    changed: string;
    /** "Previous value: {value}". */
    previousValue: string;
    /** Label of the text box opened by the "other" option (BD-14). */
    otherSpecify: string;
    selectPlaceholder: string;
    search: string;
    noResults: string;
    showOptions: string;
    openCalendar: string;
    previousMonth: string;
    nextMonth: string;
    errorSummaryTitle: string;
  };
  file: {
    takePhoto: string;
    chooseFile: string;
    chooseFromGallery: string;
    dropHere: string;
    /** "Remove {name}". */
    remove: string;
    retry: string;
    /** "{count} of {max} files". */
    count: string;
    state: Record<
      | 'selected'
      | 'compressing'
      | 'queued'
      | 'uploading'
      | 'quarantined'
      | 'ready'
      | 'failed'
      | 'rejected',
      string
    >;
  };
  table: {
    search: string;
    filters: string;
    /** "{count} active". */
    filtersActive: string;
    clearFilters: string;
    applyFilters: string;
    loadMore: string;
    previous: string;
    next: string;
    /** "{shown} of {total}". */
    resultCount: string;
    selectAll: string;
    /** "Select {name}". */
    selectRow: string;
    rowActions: string;
    pagination: string;
  };
  bulk: {
    /** "{count} selected". */
    selectedCount: string;
    moreActions: string;
    showDetails: string;
    hideDetails: string;
  };
  nav: {
    breadcrumb: string;
    /** "Back to {parent}". */
    backTo: string;
    sectionSelect: string;
  };
  offline: {
    offline: string;
    backOnline: string;
    syncing: string;
    syncFailed: string;
    /** "{count} waiting to sync". */
    pending: string;
    openOutbox: string;
  };
  feedback: {
    /** "Request id: {id}". */
    requestId: string;
    /** "{value} of {max}". */
    valueOfMax: string;
    /** "{value} of {max} ({percent}%)". */
    progressText: string;
  };
  timeline: {
    done: string;
    current: string;
    upcoming: string;
    skipped: string;
    rejected: string;
  };
}

/** Replaces `{name}` placeholders with the given, already formatted values. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    // eslint-disable-next-line security/detect-object-injection -- read-only lookup of a placeholder name
    key in values ? String(values[key]) : match,
  );
}
