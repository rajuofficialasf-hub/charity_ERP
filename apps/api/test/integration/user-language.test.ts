import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { PrismaClient } from '../../src/generated/prisma/client';
import { ApiError } from '../../src/i18n/api-error';
import { UserLanguageService } from '../../src/i18n/user-language.service';
import { user } from './support/fixtures';
import { cloneTemplate } from './support/db';

// users.language is the stored interface language (I18N 2, O-56); the endpoint arrives with T1.7.
let db: Client;
let drop: () => Promise<void>;
let prisma: PrismaClient;

beforeAll(async () => {
  const clone = await cloneTemplate(inject('templateDb'));
  db = clone.client;
  drop = clone.drop;
  prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: clone.url }) });
});

afterAll(async () => {
  await prisma.$disconnect();
  await drop();
});

describe('UserLanguageService (I18N 2)', () => {
  it('stores bn or en in users.language', async () => {
    const id = await user(db);
    const service = new UserLanguageService(prisma);
    await expect(service.setLanguage(id, 'en')).resolves.toBe('en');
    const row = await db.query('select language from users where id = $1', [id]);
    expect(row.rows[0].language).toBe('en');
  });

  it('refuses other languages and unknown users', async () => {
    const id = await user(db);
    const service = new UserLanguageService(prisma);
    await expect(service.setLanguage(id, 'fr')).rejects.toMatchObject({
      code: 'validation.option_unknown',
      status: 422,
    });
    await expect(service.setLanguage(randomUUID(), 'bn')).rejects.toBeInstanceOf(ApiError);
    const row = await db.query('select language from users where id = $1', [id]);
    expect(row.rows[0].language).toBe('bn');
  });
});
