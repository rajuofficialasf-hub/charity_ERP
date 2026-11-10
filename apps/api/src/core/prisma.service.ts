import { PrismaPg } from '@prisma/adapter-pg';
import type { Env } from '../config/env';
import { PrismaClient } from '../generated/prisma/client';

/** The one Prisma client of the process, on the pg driver adapter of Prisma 7. */
export class PrismaService extends PrismaClient {
  constructor(env: Env) {
    super({ adapter: new PrismaPg({ connectionString: env.DATABASE_URL }) });
  }
}

/** A Prisma transaction client, passed to services that must write inside the caller's transaction. */
export type Tx = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'
>;
