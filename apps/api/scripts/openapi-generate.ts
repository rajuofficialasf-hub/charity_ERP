import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/app';
import { loadEnv } from '../src/config/env';
import { closeContainer, createContainer } from '../src/container';
import { buildOpenApiDocument } from '../src/openapi/build-document';

// Writes the OpenAPI document generated from the route registry to openapi.generated.json
// (gitignored) for review next to docs/api/openapi.yaml; the drift test in test/api checks them in
// CI. No database connection is opened; the configuration below only satisfies the schema.
async function main(): Promise<void> {
  const env = loadEnv({
    NODE_ENV: 'development',
    DATABASE_URL: 'postgresql://generate:unused@127.0.0.1:5432/css_erp_dev',
    CURSOR_SECRET: 'openapi-generation-only-0123456789',
    STORAGE_DRIVER: 'filesystem',
    STORAGE_FS_ROOT: mkdtempSync(join(tmpdir(), 'css-openapi-')),
    LOG_LEVEL: 'silent',
    JWT_SECRET: 'openapi-generation-only-jwt-0123456789',
    AUTH_CSRF_SECRET: 'openapi-generation-only-csrf-012345678',
    OTP_SECRET: 'openapi-generation-only-otp-0123456789',
  });
  const container = createContainer(env);
  const { registry } = createApp(container);
  const target = join(__dirname, '..', 'openapi.generated.json');
  writeFileSync(target, JSON.stringify(buildOpenApiDocument(registry), null, 2) + '\n');
  await closeContainer(container);
  process.stdout.write(`written ${target}\n`);
}

void main();
