import { PrismaPg } from '@prisma/adapter-pg';
import type { Env } from '../config/env.js';
import { PrismaClient } from '../generated/prisma/client.js';

/** The one Prisma client of the process, on the pg driver adapter of Prisma 7. */
export class PrismaService extends PrismaClient {
  constructor(env: Env) {
    super({ adapter: new PrismaPg({ connectionString: env.DATABASE_URL }) });
  }
}

/** The pool settings a caller may set: its size and how long an idle connection stays open. */
interface PoolSettings {
  max?: number;
  idleTimeoutMillis?: number;
}

/**
 * A Prisma client on a given database, for the code outside the container: the seed, the scripts
 * and the template sync of `pnpm db:migrate`. The caller disconnects it. `pool` sets the
 * connection pool, for example one connection where a script keeps session state such as
 * temporary tables.
 */
export function prismaClientFor(connectionString: string, pool: PoolSettings = {}): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ ...pool, connectionString }) });
}

/** A Prisma transaction client, passed to services that must write inside the caller's transaction. */
export type Tx = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'
>;
