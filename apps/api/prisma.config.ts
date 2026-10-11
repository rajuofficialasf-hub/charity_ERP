import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

// Prisma CLI configuration (schema location, migrations, connection URL from apps/api/.env).
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: env('DATABASE_URL') },
});
