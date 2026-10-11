import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// Prisma CLI configuration (schema location, migrations, connection URL from apps/api/.env).
// Commands that do not touch a database (validate, generate, format) work without a URL; the
// placeholder below has no credentials, so a database command without DATABASE_URL fails clearly.
// SHADOW_DATABASE_URL is used only by the drift check (`migrate diff --from-migrations`).
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    url: process.env.DATABASE_URL ?? 'postgresql://localhost:5433/database_url_not_set',
    ...(process.env.SHADOW_DATABASE_URL
      ? { shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL }
      : {}),
  },
});
