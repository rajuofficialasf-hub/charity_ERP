export interface Rule {
  id: string;
  rule: string;
  modules: string[];
  test: string;
  status: string;
}
export type LineState = 'passing' | 'deferred' | 'manual' | 'unknown';
export interface RegisterLine {
  id: string;
  qualifier: string | null;
  text: string;
  state: LineState;
  files: string[];
}
export type RuleState = 'tested' | 'deferred' | 'manual' | 'untested';
export interface StatusRow {
  id: string;
  modules: string[];
  test: string;
  state: RuleState;
  lines: RegisterLine[];
  missingFiles: string[];
}
export function parseRules(markdown: string): Rule[];
export function parseRegister(markdown: string): Map<string, RegisterLine[]>;
export function parsePhaseMap(markdown: string): Map<number, Set<string>>;
export function rulesStatus(input: {
  rules: Rule[];
  register: Map<string, RegisterLine[]>;
  phaseModules: Set<string>;
  fileExists: (path: string) => boolean;
}): StatusRow[];
export function renderReport(rows: StatusRow[], phase: number): string;
