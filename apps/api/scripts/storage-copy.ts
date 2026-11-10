// pnpm --filter @css/api storage:copy --from s3 --to nas [--dry-run] [--limit n]
// Copies the stored files of one driver to another before the app switches STORAGE_DRIVER, for
// example from MinIO to the NAS (docs/ops/RUNBOOK.md, "Moving the files to the NAS"). Both drivers'
// settings must be set while it runs. It never deletes from the source, so a stopped run is run
// again; it changes no business data, only which driver each file row names.
import { parseArgs } from 'node:util';
import { AuditWriter } from '../src/audit/audit-writer';
import { type Env, loadEnv } from '../src/config/env';
import { PrismaService } from '../src/core/prisma.service';
import { copyFiles } from '../src/storage/copy';
import { createDriver, type StorageDriver } from '../src/storage';

const NAMES: readonly StorageDriver['name'][] = ['nas', 's3'];

function driverName(value: string | undefined, flag: string): StorageDriver['name'] {
  const name = NAMES.find((n) => n === value);
  if (!name) throw new Error(`${flag} must be one of ${NAMES.join(', ')}`);
  return name;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      from: { type: 'string' },
      to: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      limit: { type: 'string' },
    },
  });
  const fromName = driverName(values.from, '--from');
  const toName = driverName(values.to, '--to');
  // each side is read with the normal configuration, with its own driver chosen
  const envFor = (name: StorageDriver['name']): Env =>
    loadEnv({ ...process.env, STORAGE_DRIVER: name });
  const env = envFor(fromName);
  const prisma = new PrismaService(env);
  try {
    const actor = await prisma.user.findFirst({ where: { kind: 'system' }, select: { id: true } });
    const report = await copyFiles({
      prisma,
      audit: new AuditWriter(),
      from: createDriver(fromName, env),
      fromName,
      to: createDriver(toName, envFor(toName)),
      toName,
      dryRun: values['dry-run'],
      limit: values.limit ? Number(values.limit) : undefined,
      actorUserId: actor?.id ?? null,
    });
    console.warn(`storage:copy ${fromName} -> ${toName}: ${JSON.stringify(report)}`);
    if (report.missing.length || report.failed.length) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(`storage:copy failed: ${(error as Error).message}`);
  process.exit(1);
});
