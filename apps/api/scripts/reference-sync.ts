import { syncAccessCatalogue } from '../src/access/catalogue-sync.js';
import { prismaClientFor } from '../src/core/prisma.service.js';
import { syncReferenceLists } from '../src/services/reference-lists-sync.js';
import { syncWorkflowTemplates } from '../src/workflow/template-sync.js';

// Inserts the shipped roles and permissions, workflow templates and reference lists a database is
// missing, never changing a stored row, and names a stored template that differs from the shipped
// one of its version. Part of `pnpm db:migrate`.
async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');
  const prisma = prismaClientFor(url);
  try {
    // the permissions first, since the workflow transitions point at them; several hundred
    // statements one at a time take longer than the default five seconds against a database
    // across the network
    const { access, workflows, lists } = await prisma.$transaction(
      async (tx) => ({
        access: await syncAccessCatalogue(tx),
        workflows: await syncWorkflowTemplates(tx),
        lists: await syncReferenceLists(tx),
      }),
      { maxWait: 10_000, timeout: 120_000 },
    );
    const out: string[] = [
      `roles and permissions synced (${access.roles} roles, ${access.permissions} permissions inserted)`,
      `workflow templates synced (${workflows.inserted.length} inserted, ${workflows.present} present)`,
      `reference lists synced (${lists.inserted} inserted, ${lists.present} present)`,
      ...workflows.inserted.map((name) => `  workflow added: ${name}`),
      ...workflows.differing.map(
        (name) =>
          `  WARNING: the stored workflow ${name} differs from the shipped template and was left as it is (a changed template needs a new version)`,
      ),
    ];
    process.stdout.write(`${out.join('\n')}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
