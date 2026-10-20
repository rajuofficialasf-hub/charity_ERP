import { appendFileSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import Ajv2020, { type ValidateFunction } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import express, { type Express } from 'express';
import yaml from 'js-yaml';

/**
 * Checks every JSON response of the test app against docs/api/openapi.yaml (docs/testing/
 * TEST_STRATEGY.md, section "API and contract"). The drift test proves the route registry equals
 * the contract; this recorder proves the server's real answers do. `wrap(app)` records each JSON
 * response under the API prefix; a Vitest setup file fails the test when a violation was seen.
 * Each response is also written as a coverage line, so a script can tell which operations no test
 * reached.
 */

const REPO = join(__dirname, '../../../..');
const API_PREFIX = '/api/v1';
/** Where the coverage lines go: one folder per Vitest project, emptied by the global setup. */
export const COVERAGE_ROOT =
  process.env.CONTRACT_COVERAGE_DIR ?? join(__dirname, '../../test-results/contract');

interface Operation {
  operationId: string;
  method: string;
  template: string;
  matcher: RegExp;
  params: number;
  responses: Record<string, { pointer: string; json: boolean } | null>;
}

export interface ContractRecord {
  operationId: string | null;
  status: number;
}

export interface ContractViolation {
  operationId: string | null;
  method: string;
  path: string;
  status: number;
  errors: string[];
}

type OpenApi = {
  paths: Record<
    string,
    Record<string, { operationId: string; responses: Record<string, unknown> }>
  >;
  components: { responses: Record<string, unknown>; schemas: Record<string, unknown> };
};

// the contract refers to the JSON Schemas of docs/database by relative path, so every file keeps
// its place under one made-up origin
const ORIGIN = 'https://css-erp.assunnahfoundation.org';
const DOCUMENT_ID = `${ORIGIN}/docs/api/openapi.yaml`;
const JSON_SCHEMAS = 'docs/database/json-schemas';
const TEMPLATE_SCHEMA = 'docs/architecture/workflow-templates/schema.json';
const METHODS = new Set(['get', 'post', 'put', 'patch', 'delete']);
/** A JSON-pointer segment inside a URI fragment: `~` and `/` escaped, then percent-encoded. */
const pointerSegment = (s: string) =>
  encodeURIComponent(s.replace(/~/g, '~0').replace(/\//g, '~1'));

function loadContract() {
  const document = yaml.load(readFileSync(join(REPO, 'docs/api/openapi.yaml'), 'utf8')) as OpenApi;
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  ajv.addSchema({ ...document, $id: DOCUMENT_ID });
  for (const file of readdirSync(join(REPO, JSON_SCHEMAS)).filter((f) => f.endsWith('.json'))) {
    const schema = JSON.parse(readFileSync(join(REPO, JSON_SCHEMAS, file), 'utf8')) as object;
    ajv.addSchema({ ...schema, $id: `${ORIGIN}/${JSON_SCHEMAS}/${file}` });
  }
  const template = JSON.parse(readFileSync(join(REPO, TEMPLATE_SCHEMA), 'utf8')) as object;
  ajv.addSchema({ ...template, $id: `${ORIGIN}/${TEMPLATE_SCHEMA}` });
  const operations: Operation[] = [];
  for (const [template, item] of Object.entries(document.paths)) {
    for (const [method, op] of Object.entries(item)) {
      if (!METHODS.has(method)) continue;
      const responses: Operation['responses'] = {};
      for (const [status, response] of Object.entries(op.responses)) {
        const ref = (response as { $ref?: string }).$ref;
        const resolved = ref
          ? document.components.responses[ref.replace('#/components/responses/', '')]
          : response;
        const content = (resolved as { content?: Record<string, unknown> }).content;
        // the schema lives where the response object is written: inline, or in the shared responses
        const base = ref
          ? ref.slice(1)
          : `/paths/${pointerSegment(template)}/${method}/responses/${status}`;
        responses[status] = {
          json: Boolean(content?.['application/json']),
          pointer: `#${base}/content/application~1json/schema`,
        };
      }
      const params = (template.match(/\{[^}]+\}/g) ?? []).length;
      operations.push({
        operationId: op.operationId,
        method,
        template,
        params,
        matcher: new RegExp(`^${template.replace(/\{[^}]+\}/g, '[^/]+')}$`),
        responses,
      });
    }
  }
  // a static path wins over a parameter in the same position
  operations.sort((a, b) => a.params - b.params);
  const validators = new Map<string, ValidateFunction>();
  const validatorFor = (pointer: string): ValidateFunction => {
    let v = validators.get(pointer);
    if (!v) {
      v = ajv.compile({ $ref: `${DOCUMENT_ID}${pointer}` });
      validators.set(pointer, v);
    }
    return v;
  };
  return { operations, validatorFor };
}

let contract: ReturnType<typeof loadContract> | undefined;
const loaded = () => (contract ??= loadContract());

const ERROR_ENVELOPE = '#/components/schemas/ErrorResponse';

class ContractRecorder {
  private readonly seen: ContractRecord[] = [];
  private readonly problems: ContractViolation[] = [];
  private pending: ContractRecord[] = [];
  /** The folder of this run's coverage lines; the setup file points it at the project's folder. */
  coverageDir = COVERAGE_ROOT;

  /**
   * Records one response of the API: `path` is the request path without the API prefix, `body`
   * the JSON sent, or undefined when the answer had no JSON body (a 204, a streamed file).
   */
  record(method: string, path: string, status: number, body: unknown): void {
    const { operations, validatorFor } = loaded();
    const m = method.toLowerCase();
    const op = operations.find((o) => o.method === m && o.matcher.test(path));
    const entry = { operationId: op?.operationId ?? null, status };
    this.seen.push(entry);
    this.pending.push(entry);
    // a path the contract does not know is a test probe or the app's own 404 for one: the drift
    // test proves every registered route is in the contract
    if (!op) return;
    if (status === 204) return;
    const declared = op.responses[String(status)];
    let pointer: string;
    if (declared) {
      if (!declared.json) return;
      if (body === undefined) {
        this.problems.push({
          ...entry,
          method: m,
          path,
          errors: [`no JSON body, but ${op.operationId} declares one for status ${status}`],
        });
        return;
      }
      pointer = declared.pointer;
    } else if (status >= 400) {
      // an error the operation does not list still has to be the shared error envelope
      pointer = ERROR_ENVELOPE;
    } else {
      this.problems.push({
        ...entry,
        method: m,
        path,
        errors: [`status ${status} is not declared for ${op.operationId}`],
      });
      return;
    }
    let validate: ValidateFunction;
    try {
      validate = validatorFor(pointer);
    } catch (error) {
      // a schema the validator cannot compile is a contract problem, never a failed request
      this.problems.push({
        ...entry,
        method: m,
        path,
        errors: [
          `cannot compile ${pointer}: ${error instanceof Error ? error.message : String(error)}`,
        ],
      });
      return;
    }
    if (!validate(body)) {
      const errors = (validate.errors ?? []).map((e) =>
        `${e.instancePath || '/'} ${e.message ?? ''}`.trim(),
      );
      this.problems.push({ ...entry, method: m, path, errors });
    }
  }

  /** The responses recorded since the last reset. */
  records(): ContractRecord[] {
    return [...this.seen];
  }

  violations(): ContractViolation[] {
    return [...this.problems];
  }

  /** Forgets the records and violations of the test that just ended; the coverage lines stay. */
  reset(): void {
    this.seen.length = 0;
    this.problems.length = 0;
  }

  /** Appends every response not yet written to this process's coverage file, and returns them. */
  flushCoverage(): ContractRecord[] {
    const lines = this.pending;
    this.pending = [];
    if (lines.length === 0) return lines;
    mkdirSync(this.coverageDir, { recursive: true });
    appendFileSync(
      join(this.coverageDir, `${process.pid}.jsonl`),
      `${lines.map((l) => JSON.stringify(l)).join('\n')}\n`,
    );
    return lines;
  }

  /** The app inside an outer one whose middleware records every response under the prefix. */
  wrap(app: Express): Express {
    const outer = express();
    outer.use((req, res, next) => {
      if (!req.path.startsWith(`${API_PREFIX}/`) && req.path !== API_PREFIX) return next();
      const json = res.json.bind(res);
      let recorded = false;
      const path = (req.originalUrl.split('?')[0] ?? '').slice(API_PREFIX.length);
      res.json = (body: unknown) => {
        if (!recorded) {
          recorded = true;
          // the value the client receives: a Date is a string on the wire, undefined is dropped
          const wire: unknown = body === undefined ? undefined : JSON.parse(JSON.stringify(body));
          this.record(req.method, path, res.statusCode, wire);
        }
        return json(body);
      };
      // an answer without a JSON body (a 204, a streamed file) is recorded once it is sent
      res.on('finish', () => {
        if (recorded) return;
        recorded = true;
        this.record(req.method, path, res.statusCode, undefined);
      });
      next();
    });
    outer.use(app);
    return outer;
  }
}

export const contractRecorder = new ContractRecorder();
