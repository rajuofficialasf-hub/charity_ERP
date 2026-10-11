// pnpm docs:check: machine checks of the machine-readable project documents (run in CI).
// 1. permissions.yaml, openapi.yaml and every workflow template parse as YAML.
// 2. The workflow templates validate against workflow-templates/schema.json.
// 3. The JSON Schemas in docs/database/json-schemas compile.
// 4. Redocly lints openapi.yaml with docs/api/redocly.yaml.
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import yaml from 'js-yaml';

const failures = [];
const ok = (message) => console.warn(`ok   ${message}`);
const fail = (message) => {
  failures.push(message);
  console.error(`FAIL ${message}`);
};

function parseYaml(path) {
  try {
    return yaml.load(readFileSync(path, 'utf8'));
  } catch (error) {
    fail(`${path}: ${error.message.split('\n')[0]}`);
    return undefined;
  }
}

const permissions = parseYaml('docs/security/permissions.yaml');
if (permissions) {
  const count = Array.isArray(permissions.permissions)
    ? permissions.permissions.length
    : Object.keys(permissions.permissions ?? {}).length;
  ok(`permissions.yaml parses (${count} permissions)`);
}

const openapi = parseYaml('docs/api/openapi.yaml');
if (openapi) {
  const methods = ['get', 'post', 'put', 'patch', 'delete'];
  const operations = Object.values(openapi.paths ?? {}).reduce(
    (n, item) => n + methods.filter((m) => item[m]).length,
    0,
  );
  ok(`openapi.yaml parses (${operations} operations)`);
}

const templatesDir = 'docs/architecture/workflow-templates';
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const templateSchema = JSON.parse(readFileSync(join(templatesDir, 'schema.json'), 'utf8'));
const validateTemplate = ajv.compile(templateSchema);
for (const file of readdirSync(templatesDir).filter((f) => f.endsWith('.yaml'))) {
  const template = parseYaml(join(templatesDir, file));
  if (template === undefined) continue;
  if (validateTemplate(template)) {
    ok(`${file} valid against schema.json`);
  } else {
    const errors = validateTemplate.errors.map((e) => `${e.instancePath || '/'} ${e.message}`);
    fail(`${file}: ${errors.slice(0, 5).join('; ')}`);
  }
}

// workflow-definition.schema.json refers to the template schema by a relative path, which
// resolves against its $id to the URL below.
const schemasDir = 'docs/database/json-schemas';
const templateSchemaUrl = new URL(
  '../../architecture/workflow-templates/schema.json',
  'https://css-erp.assunnahfoundation.org/schemas/workflow-definition.json',
).href;
for (const file of readdirSync(schemasDir).filter((f) => f.endsWith('.json'))) {
  try {
    const schemaAjv = new Ajv2020({ strict: false });
    addFormats(schemaAjv);
    schemaAjv.addSchema({ ...templateSchema, $id: templateSchemaUrl });
    schemaAjv.compile(JSON.parse(readFileSync(join(schemasDir, file), 'utf8')));
    ok(`${file} compiles`);
  } catch (error) {
    fail(`${file}: ${error.message}`);
  }
}

const redoclyCli = createRequire(import.meta.url).resolve('@redocly/cli/bin/cli.js');
const redocly = spawnSync(
  process.execPath,
  [redoclyCli, 'lint', 'docs/api/openapi.yaml', '--config', 'docs/api/redocly.yaml'],
  { encoding: 'utf8' },
);
if (redocly.status === 0) {
  ok('openapi.yaml passes Redocly lint');
} else {
  console.error(redocly.stdout, redocly.stderr);
  fail('openapi.yaml fails Redocly lint');
}

if (failures.length > 0) {
  console.error(`\n${failures.length} document check(s) failed.`);
  process.exit(1);
}
console.warn('\nAll document checks passed.');
