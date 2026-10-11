import { describe, expect, it } from 'vitest';
import { checkDestructiveDbAccess } from './db-guard';

const url = (db: string) => `postgresql://css:pw@127.0.0.1:5432/${db}`;

describe('checkDestructiveDbAccess (BR-024, BD-49)', () => {
  it.each(['css_erp_dev', 'css_erp_test', 'css_erp_test_worker_3'])('allows %s', (db) => {
    expect(checkDestructiveDbAccess({ NODE_ENV: 'development', DATABASE_URL: url(db) })).toEqual({
      allowed: true,
      database: db,
    });
  });

  it('refuses when NODE_ENV is production, even for a dev database', () => {
    expect(
      checkDestructiveDbAccess({ NODE_ENV: 'production', DATABASE_URL: url('css_erp_dev') }),
    ).toEqual({ allowed: false, reason: 'NODE_ENV is production' });
  });

  it.each(['css_erp', 'css_erp_prod', 'css_erp_staging', 'postgres', 'my_css_erp_dev'])(
    'refuses database %s',
    (db) => {
      expect(
        checkDestructiveDbAccess({ NODE_ENV: 'development', DATABASE_URL: url(db) }).allowed,
      ).toBe(false);
    },
  );

  it('refuses a missing or malformed DATABASE_URL', () => {
    expect(checkDestructiveDbAccess({ NODE_ENV: 'test' }).allowed).toBe(false);
    expect(checkDestructiveDbAccess({ NODE_ENV: 'test', DATABASE_URL: 'not a url' }).allowed).toBe(
      false,
    );
  });
});
