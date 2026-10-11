import { describe, expect, it } from 'vitest';
import { loadEnv } from './env';

describe('loadEnv', () => {
  it('applies defaults and parses the port', () => {
    const env = loadEnv({
      DATABASE_URL: 'postgresql://u:p@localhost:5432/css_erp_dev',
      PORT: '4100',
    });
    expect(env).toEqual({
      NODE_ENV: 'development',
      PORT: 4100,
      DATABASE_URL: 'postgresql://u:p@localhost:5432/css_erp_dev',
    });
  });

  it('fails fast with the variable name when a value is missing', () => {
    expect(() => loadEnv({})).toThrow(/DATABASE_URL/);
  });

  it('rejects a database URL that is not PostgreSQL', () => {
    expect(() => loadEnv({ DATABASE_URL: 'mysql://u:p@localhost/db' })).toThrow(/DATABASE_URL/);
  });
});
