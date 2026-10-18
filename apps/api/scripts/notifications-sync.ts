import { syncNotificationTemplates } from '../src/notifications/template-sync';

// Inserts the notification templates that are missing, never overwriting an edited one.
// Part of `pnpm db:migrate`.
async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');
  const inserted = await syncNotificationTemplates(url);
  process.stdout.write(`notification templates synced (${inserted} inserted)\n`);
}

void main();
