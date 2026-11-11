import { describe, expect, it } from 'vitest';
import { checkDestructiveDbAccess, checkPerfDbAccess } from './db-guard.js';

const url = (db: string) => `postgresql://css:pw@127.0.0.1:5432/${db}`;

describe('checkDestructiveDbAccess', () => {
  it.each(['css_erp_dev', 'css_erp_test', 'css_erp_test_worker_3', 'css_erp_perf'])(
    'allows %s',
    (db) => {
      expect(checkDestructiveDbAccess({ NODE_ENV: 'development', DATABASE_URL: url(db) })).toEqual({
        allowed: true,
        database: db,
      });
    },
  );

  it('refuses when NODE_ENV is production, even for a dev database', () => {
    expect(
      checkDestructiveDbAccess({ NODE_ENV: 'production', DATABASE_URL: url('css_erp_dev') }),
    ).toEqual({ allowed: false, reason: 'NODE_ENV is production' });
    expect(
      checkDestructiveDbAccess({ NODE_ENV: 'production', DATABASE_URL: url('css_erp_perf') }),
    ).toEqual({ allowed: false, reason: 'NODE_ENV is production' });
  });

  it.each([
    'css_erp',
    'css_erp_prod',
    'css_erp_staging',
    'postgres',
    'my_css_erp_dev',
    'css_erp_perfx',
  ])('refuses database %s', (db) => {
    expect(
      checkDestructiveDbAccess({ NODE_ENV: 'development', DATABASE_URL: url(db) }).allowed,
    ).toBe(false);
  });

  it('refuses a missing or malformed DATABASE_URL', () => {
    expect(checkDestructiveDbAccess({ NODE_ENV: 'test' }).allowed).toBe(false);
    expect(checkDestructiveDbAccess({ NODE_ENV: 'test', DATABASE_URL: 'not a url' }).allowed).toBe(
      false,
    );
  });
});

describe('checkPerfDbAccess: where the measurement scripts may build their data set', () => {
  it('takes DATABASE_URL with the database name replaced by css_erp_perf', () => {
    expect(
      checkPerfDbAccess({ NODE_ENV: 'development', DATABASE_URL: url('css_erp_dev') }),
    ).toEqual({
      allowed: true,
      url: url('css_erp_perf'),
      database: 'css_erp_perf',
    });
  });

  it('takes PERF_DATABASE_URL as given, with a suffix allowed', () => {
    const target = checkPerfDbAccess({
      DATABASE_URL: url('css_erp_dev'),
      PERF_DATABASE_URL: url('css_erp_perf_2'),
    });
    expect(target).toMatchObject({ allowed: true, database: 'css_erp_perf_2' });
  });

  it.each(['css_erp_dev', 'css_erp_test', 'css_erp', 'postgres'])(
    'refuses a PERF_DATABASE_URL naming %s',
    (db) => {
      expect(checkPerfDbAccess({ PERF_DATABASE_URL: url(db) }).allowed).toBe(false);
    },
  );

  it('refuses production, another host and a missing address', () => {
    expect(checkPerfDbAccess({ NODE_ENV: 'production', DATABASE_URL: url('css_erp_dev') })).toEqual(
      { allowed: false, reason: 'NODE_ENV is production' },
    );
    expect(
      checkPerfDbAccess({
        PERF_DATABASE_URL: 'postgresql://css:pw@db.example.org:5432/css_erp_perf',
      }).allowed,
    ).toBe(false);
    expect(checkPerfDbAccess({}).allowed).toBe(false);
  });
});
