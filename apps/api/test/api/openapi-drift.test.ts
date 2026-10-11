import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Controller, type INestApplication, Module, Put } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import yaml from 'js-yaml';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/bootstrap';
import { ApiContract } from '../../src/openapi/api-contract';
import { buildOpenApiDocument } from '../../src/openapi/document';
import { compareWithContract } from '../../src/openapi/drift';
import { ZBody } from '../../src/core/validation';
import { testEnv } from '../support/env';

// The generated document must match docs/api/openapi.yaml (API_STANDARDS 16, NFR-54).
const repo = join(__dirname, '../../../..');
const contract = yaml.load(readFileSync(join(repo, 'docs/api/openapi.yaml'), 'utf8')) as Record<
  string,
  never
>;
const permissions = new Set(
  (
    yaml.load(readFileSync(join(repo, 'docs/security/permissions.yaml'), 'utf8')) as {
      permissions: { name: string }[];
    }
  ).permissions.map((p) => p.name),
);

const languageBody = z.strictObject({ language: z.enum(['bn', 'en']) });
const contractOf = {
  operationId: 'auth.me.language.set',
  tag: 'auth',
  summary: 'Set own interface language',
  permission: 'authenticated',
  scope: 'self',
  audit: 'user.language_changed',
  idempotency: 'none' as const,
  rateLimit: 'default' as const,
  body: languageBody,
  responses: { 204: null, 401: null, 422: null },
};

@Controller('me')
class MatchingController {
  @Put('language')
  @ApiContract(contractOf)
  set(@ZBody(languageBody) _body: unknown) {
    return null;
  }
}

@Controller('me')
class DriftingController {
  @Put('language')
  @ApiContract({
    ...contractOf,
    audit: 'none',
    permission: 'no.such_permission',
    body: z.strictObject({ language: z.string() }),
    responses: { 204: null },
  })
  set(@ZBody(z.strictObject({ language: z.string() })) _body: unknown) {
    return null;
  }
}

async function generate(...extra: unknown[]) {
  @Module({ controllers: extra as never[] })
  class Extra {}
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule.register(testEnv()), Extra],
  }).compile();
  const app: INestApplication = configureApp(moduleRef.createNestApplication());
  await app.init();
  return { app, document: buildOpenApiDocument(app) };
}

let open: INestApplication | undefined;
afterEach(async () => {
  await open?.close();
  open = undefined;
});

describe('OpenAPI drift test (API_STANDARDS 16)', () => {
  it('the application matches docs/api/openapi.yaml', async () => {
    const { app, document } = await generate();
    open = app;
    expect(compareWithContract(document as never, contract, permissions)).toEqual([]);
  });

  it('an operation declared like the contract passes', async () => {
    const { app, document } = await generate(MatchingController);
    open = app;
    expect(Object.keys(document.paths)).toContain('/me/language');
    expect(compareWithContract(document as never, contract, permissions)).toEqual([]);
  });

  it('an operation that drifts from the contract fails with every difference named', async () => {
    const { app, document } = await generate(DriftingController);
    open = app;
    const problems = compareWithContract(document as never, contract, permissions).join('\n');
    expect(problems).toMatch(/x-audit is "none", the contract says "user.language_changed"/);
    expect(problems).toMatch(/unknown x-permission "no.such_permission"/);
    expect(problems).toMatch(/request body schema/);
    expect(problems).toMatch(/responses \["204"\] differ/);
  });
});
