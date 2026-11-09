/** What the builder may change: everything on a computer, only texts on a phone, nothing read-only. */
export type BuilderMode = 'full' | 'texts' | 'read';

/** The part of the form the settings pane shows: a section, or a question in it. */
export interface Selection {
  section: string;
  field?: string;
}
