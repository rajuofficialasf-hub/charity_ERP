import { join } from 'node:path';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

// The lint guard that keeps the API's own code, the seed and the scripts on Prisma: no `pg` import
// outside the pg-boss files and the tests, and no raw call that takes a built string.
const root = join(__dirname, '../../../..');
const eslint = new ESLint({ cwd: root });

const errors = async (code: string, filePath: string, ruleId: string) => {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).filter((m) => m.ruleId === ruleId);
};
const pgImport = "import { Client } from 'pg';\nexport const C = Client;\n";
const pgTypeImport = "import type { Client } from 'pg';\nexport type C = Client;\n";

describe('the database access rule', { timeout: 30_000 }, () => {
  it('refuses a pg import in the API code, the seed and the scripts', async () => {
    for (const file of [
      'apps/api/src/services/example.ts',
      'apps/api/src/locations/example.ts',
      'apps/api/seed/sets/example.ts',
      'apps/api/scripts/example.ts',
    ]) {
      expect(await errors(pgImport, file, 'no-restricted-imports'), file).toHaveLength(1);
      expect(await errors(pgTypeImport, file, 'no-restricted-imports'), file).toHaveLength(1);
    }
    const subpath = "import { Pool } from 'pg/lib/index';\nexport const P = Pool;\n";
    expect(
      await errors(subpath, 'apps/api/src/core/example.ts', 'no-restricted-imports'),
    ).toHaveLength(1);
  });

  it('lets the pg-boss files and the tests keep pg', async () => {
    for (const file of [
      'apps/api/src/jobs/example.ts',
      'apps/api/src/core/example.spec.ts',
      'apps/api/test/integration/example.test.ts',
      'apps/api/test/integration/support/example.ts',
    ])
      expect(await errors(pgImport, file, 'no-restricted-imports'), file).toHaveLength(0);
  });

  it('refuses $queryRawUnsafe and $executeRawUnsafe in the API code, the seed and the scripts', async () => {
    const unsafe = [
      'export const a = (p: any, s: string) => p.$queryRawUnsafe(s);\n',
      'export const b = (p: any, s: string) => p.$executeRawUnsafe(s);\n',
      "export const c = (p: any, s: string) => p['$queryRawUnsafe'](s);\n",
    ];
    for (const file of [
      'apps/api/src/services/example.ts',
      'apps/api/src/jobs/example.ts',
      'apps/api/seed/example.ts',
      'apps/api/scripts/example.ts',
    ])
      for (const code of unsafe)
        expect(await errors(code, file, 'no-restricted-syntax'), `${file}: ${code}`).toHaveLength(
          1,
        );
  });

  it('allows the tagged $queryRaw and $executeRaw', async () => {
    const tagged =
      'export const a = (p: any, id: string) => p.$queryRaw`SELECT 1 WHERE id = ${id}`;\n' +
      'export const b = (p: any, id: string) => p.$executeRaw`DELETE FROM t WHERE id = ${id}`;\n';
    expect(
      await errors(tagged, 'apps/api/src/services/example.ts', 'no-restricted-syntax'),
    ).toHaveLength(0);
  });
});
