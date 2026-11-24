import { syncNotificationTemplates } from '../src/notifications/template-sync.js';

// Inserts the notification templates that are missing and gives a shipped text that changed a new
// version, never touching one an administrator edited. Part of `pnpm db:migrate`.
async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');
  const { inserted, upgraded } = await syncNotificationTemplates(url);
  process.stdout.write(
    `notification templates synced (${inserted} inserted, ${upgraded} brought up to date)\n`,
  );
}

void main();
