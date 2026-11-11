// @ts-check
// Reads docs/BUSINESS_RULES.md (the rule rows and the test-status register) and the phase map of
// docs/MODULE_CATALOG.md, and says for every testable rule of a phase whether it is tested,
// deferred to a later task, manual, or still untested (docs/testing/TEST_STRATEGY.md, section
// "How BUSINESS_RULES.md tracks test status").

/** A module token the rules table uses for a rule that applies to every module or to the interface. */
const CROSS_CUTTING = new Set(['all', 'UI']);
/** Expected-test values that ask for no automated test. */
const NOT_TESTABLE = new Set(['manual', 'none', '—', '']);
/** The row state a register state gives, in priority order; no match means untested. */
const STATE_OF_LINES = /** @type {const} */ ([
  ['passing', 'tested'],
  ['deferred', 'deferred'],
  ['manual', 'manual'],
]);

/**
 * @typedef {{ id: string, rule: string, modules: string[], test: string, status: string }} Rule
 * @typedef {'passing' | 'failing' | 'deferred' | 'manual' | 'unknown'} LineState
 * @typedef {{ id: string, qualifier: string | null, text: string, state: LineState, files: string[] }} RegisterLine
 * @typedef {'tested' | 'deferred' | 'manual' | 'untested'} RuleState
 * @typedef {{ id: string, modules: string[], test: string, state: RuleState, lines: RegisterLine[], missingFiles: string[] }} StatusRow
 */

const cells = (/** @type {string} */ line) =>
  line
    .split('|')
    .slice(1, -1)
    .map((c) => c.trim());

/**
 * The rule rows of every table: id, rule text, module tokens, expected test, status.
 * @param {string} markdown
 * @returns {Rule[]}
 */
export function parseRules(markdown) {
  /** @type {Rule[]} */
  const rules = [];
  for (const line of markdown.split('\n')) {
    if (!/^\| BR-\d{3} \|/.test(line)) continue;
    const c = cells(line);
    const [id, rule, , , module, , , test, status] = c;
    if (!id || c.length < 9) continue;
    rules.push({
      id,
      rule: rule ?? '',
      modules: (module ?? '')
        .split(',')
        .map((m) => m.trim())
        .filter(Boolean),
      test: test ?? '',
      status: status ?? '',
    });
  }
  return rules;
}

/** Repository paths of test files named in a register line: a token with a folder and a test-file extension. */
const filesIn = (/** @type {string} */ text) => [
  ...new Set(
    text
      .split(/[\s;,()]+/)
      .map((token) => token.split('::')[0] ?? '')
      .filter((token) => token.includes('/') && /\.(?:ts|tsx|mts|mjs|js)$/.test(token)),
  ),
];

/**
 * The state a register line declares, read from its structure and never from a note: a line
 * starting with `deferred to` or `manual`, a test file with `— passing (date…)` at the end, or
 * `— failing (…)`; anything else is unknown, which the status treats as untested.
 * @param {string} text
 * @param {string[]} files
 * @returns {LineState}
 */
const stateOf = (text, files) => {
  if (/^deferred to\b/i.test(text)) return 'deferred';
  if (/^manual\b/i.test(text)) return 'manual';
  if (/—\s*failing\b/i.test(text)) return 'failing';
  if (files.length > 0 && /—\s*passing \(\d{4}-\d{2}-\d{2}[^)]*\)\s*$/.test(text)) return 'passing';
  return 'unknown';
};

/**
 * The lines of the test-status register, by rule id. A line may name several ids separated by
 * commas, with an optional qualifier in parentheses before the colon.
 * @param {string} markdown
 * @returns {Map<string, RegisterLine[]>}
 */
export function parseRegister(markdown) {
  /** @type {Map<string, RegisterLine[]>} */
  const register = new Map();
  const section = markdown.split(/^## 19\. /m)[1];
  if (!section) return register;
  const body = section.split(/^## /m)[0] ?? '';
  for (const line of body.split('\n')) {
    if (!line.startsWith('- BR-')) continue;
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const head = line.slice(2, colon).trim();
    const qualifier = /\(([^)]*)\)$/.exec(head)?.[1] ?? null;
    const ids = [...head.matchAll(/BR-\d{3}/g)].map((x) => x[0]);
    if (ids.length === 0) continue;
    const text = line.slice(colon + 1).trim();
    const files = filesIn(text);
    const entry = { qualifier, text, state: stateOf(text, files), files };
    for (const id of ids) {
      const list = register.get(id) ?? [];
      list.push({ id, ...entry });
      register.set(id, list);
    }
  }
  return register;
}

/**
 * The phase map table of docs/MODULE_CATALOG.md: module codes per phase number.
 * @param {string} markdown
 * @returns {Map<number, Set<string>>}
 */
export function parsePhaseMap(markdown) {
  /** @type {Map<number, Set<string>>} */
  const phases = new Map();
  const section = markdown.split(/^## 4\. Phase map/m)[1];
  if (!section) return phases;
  for (const line of (section.split(/^## /m)[0] ?? '').split('\n')) {
    const m = /^\| (\d+) \| (.*) \|\s*$/.exec(line);
    if (!m) continue;
    const codes = [...(m[2] ?? '').matchAll(/\bM\d{2}\b/g)].map((x) => x[0]);
    phases.set(Number(m[1]), new Set(codes));
  }
  return phases;
}

const isTestable = (/** @type {Rule} */ rule) =>
  !NOT_TESTABLE.has(rule.test.trim()) && !/^retired\b/i.test(rule.status);

/**
 * The status of every testable rule whose module is in the phase (a module of the phase, or a
 * cross-cutting rule): tested when a register line names a passing test, deferred or manual when
 * the register says so, untested otherwise. A register line that names a file missing from the
 * repository is reported on the row.
 * @param {{ rules: Rule[], register: Map<string, RegisterLine[]>, phaseModules: Set<string>, fileExists: (path: string) => boolean }} input
 * @returns {StatusRow[]}
 */
export function rulesStatus({ rules, register, phaseModules, fileExists }) {
  /** @type {StatusRow[]} */
  const rows = [];
  for (const rule of rules) {
    if (!isTestable(rule)) continue;
    const inPhase = rule.modules.some((m) => phaseModules.has(m) || CROSS_CUTTING.has(m));
    if (!inPhase) continue;
    const lines = register.get(rule.id) ?? [];
    const states = new Set(lines.map((l) => l.state));
    const state = STATE_OF_LINES.find(([lineState]) => states.has(lineState))?.[1] ?? 'untested';
    const missingFiles = lines.flatMap((l) => l.files.filter((f) => !fileExists(f)));
    rows.push({ id: rule.id, modules: rule.modules, test: rule.test, state, lines, missingFiles });
  }
  return rows;
}

/**
 * What stops a phase from passing the check: untested rules and register lines with missing files.
 * @param {StatusRow[]} rows
 */
export function problemsOf(rows) {
  return {
    untested: rows.filter((r) => r.state === 'untested').map((r) => r.id),
    missingFiles: rows
      .filter((r) => r.missingFiles.length)
      .map((r) => ({ id: r.id, files: r.missingFiles })),
  };
}

/**
 * A Markdown report: the counts, then one row per rule.
 * @param {StatusRow[]} rows
 * @param {number} phase
 */
export function renderReport(rows, phase) {
  const count = (/** @type {RuleState} */ s) => rows.filter((r) => r.state === s).length;
  const lines = [
    `## Phase ${phase} rules: tested ${count('tested')}, deferred ${count('deferred')}, manual ${count('manual')}, untested ${count('untested')}`,
    '',
    '| Rule | Module | Expected test | State | Register |',
    '|---|---|---|---|---|',
  ];
  for (const r of rows) {
    const note = r.lines.map((l) => l.text).join(' · ') || '—';
    const missing = r.missingFiles.length ? ` (missing file: ${r.missingFiles.join(', ')})` : '';
    lines.push(
      `| ${r.id} | ${r.modules.join(', ')} | ${r.test} | ${r.state} | ${note}${missing} |`,
    );
  }
  return `${lines.join('\n')}\n`;
}
