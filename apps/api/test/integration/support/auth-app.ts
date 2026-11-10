import type { RouteRegistry } from '../../../src/openapi/registry';
import type { AccessRegistry } from '../../../src/access/registry';
import { randomUUID } from 'node:crypto';
import { hash } from '@node-rs/argon2';
import { createServer, type Server } from 'node:http';
import type { Express } from 'express';
import type { Client } from 'pg';
import type { DestinationStream } from 'pino';
import request from 'supertest';
import { inject } from 'vitest';
import { createApp, type AppOptions } from '../../../src/app';
import { ARGON2_OPTIONS } from '../../../src/auth/password-hasher';
import { closeContainer, type Container, createContainer } from '../../../src/container';
import { testEnv } from '../../support/env';
import { contractRecorder } from '../../support/contract';
import { withAppOrigin } from '../../support/origin';
import { cloneTemplate } from './db';
import { fakeMobile } from './fixtures';

/** A clock the tests move forward (lockout, token, session and OTP lifetimes). */
export class TestClock {
  private t = Date.now();
  now = () => new Date(this.t);
  advance(ms: number): void {
    this.t += ms;
  }
}

export const PASSWORD = 'Nadi kul 2026';

const ROLES = [
  { key: 'department_head', kind: 'official', global: true },
  { key: 'monitoring_team', kind: 'official', global: true },
  { key: 'program_manager', kind: 'official', global: false },
  { key: 'regional_program_manager', kind: 'official', global: false },
  { key: 'volunteer_general', kind: 'volunteer', global: false },
];

export interface AuthHarness {
  app: Express;
  container: Container;
  /** Every operation the app registered (the authorization matrix walks it). */
  registry: RouteRegistry;
  db: Client;
  clock: TestClock;
  /**
   * One listening server per harness: `request(app)` would start and stop a server for every
   * request, which kills Vitest workers on Windows under load (see authorization-matrix.test.ts).
   */
  server: () => Server;
  close: () => Promise<void>;
}

/**
 * The real API application (createApp, as server.ts builds it) on a fresh cloned database with
 * the roles of the tests. The rate limits are relaxed a hundredfold (RATE_LIMITS_RELAXED); the
 * limits themselves are covered in test/api/guards.
 */
export async function authHarness(
  options: {
    realRateLimits?: boolean;
    /** The device limit of the E2E run (a hundredfold) instead of the real one. */
    relaxedDeviceLimit?: boolean;
    logStream?: DestinationStream;
    extraRouters?: AppOptions['extraRouters'];
    /** A fixture permission catalogue instead of docs/security/permissions.yaml. */
    accessRegistry?: AccessRegistry;
    /** Services replaced for the test (a recording notification hook). */
    overrides?: Partial<Container>;
  } = {},
): Promise<AuthHarness> {
  const clone = await cloneTemplate(inject('templateDb'));
  for (const role of ROLES)
    await clone.client.query(
      `INSERT INTO roles (key, name_bn, name_en, kind, global_scope) VALUES ($1, $1, $1, $2, $3)`,
      [role.key, role.kind, role.global],
    );
  const clock = new TestClock();
  const env = testEnv({
    DATABASE_URL: clone.url,
    RATE_LIMITS_RELAXED: options.realRateLimits ? 'false' : 'true',
    SESSION_DEVICE_LIMIT_RELAXED: options.relaxedDeviceLimit ? 'true' : 'false',
    // a captured log stream needs log lines (the test env is silent otherwise)
    ...(options.logStream ? { LOG_LEVEL: 'info' } : {}),
  });
  const container = createContainer(env, {
    overrides: {
      ...options.overrides,
      clock,
      ...(options.accessRegistry ? { accessRegistry: options.accessRegistry } : {}),
    },
    logStream: options.logStream,
  });
  const { app, registry } = createApp(container, {
    logStream: options.logStream,
    extraRouters: options.extraRouters,
  });
  // every response is checked against the contract (test/support/contract.ts), through the
  // listening server and through the app a test serves itself
  const wrapped = withAppOrigin(contractRecorder.wrap(app), container.env.APP_ORIGIN);
  const listening = createServer(wrapped);
  await new Promise<void>((resolve) => listening.listen(0, '127.0.0.1', resolve));
  return {
    app: wrapped,
    container,
    registry,
    db: clone.client,
    clock,
    server: () => listening,
    close: async () => {
      listening.closeAllConnections();
      await new Promise((resolve) => listening.close(resolve));
      await closeContainer(container);
      await clone.drop();
    },
  };
}

let passwordHash: Promise<string> | undefined;
let counter = 0;

export interface Account {
  id: string;
  email: string | null;
  mobile: string;
  loginId: string;
}

/** An account with the test password; staff log in with the email, volunteers with the mobile. */
export async function account(
  db: Client,
  options: {
    kind?: 'staff' | 'volunteer';
    role?: string;
    state?: string;
    systemOwner?: boolean;
    password?: string;
  } = {},
): Promise<Account> {
  const kind = options.kind ?? 'staff';
  const id = randomUUID();
  const n = ++counter;
  const email = kind === 'staff' ? `auth${n}.${id.slice(0, 6)}@example.org` : null;
  const mobile = fakeMobile();
  const pw = options.password
    ? await hash(options.password, ARGON2_OPTIONS)
    : await (passwordHash ??= hash(PASSWORD, ARGON2_OPTIONS));
  await db.query(
    `INSERT INTO users (id, kind, email, mobile, password_hash, state, display_name, is_system_owner)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      id,
      kind,
      email,
      mobile,
      pw,
      options.state ?? 'active',
      `নমুনা ${n}`,
      options.systemOwner ?? false,
    ],
  );
  const role = options.role ?? (kind === 'staff' ? 'program_manager' : 'volunteer_general');
  await db.query(
    `INSERT INTO user_roles (id, user_id, role_key, granted_by) VALUES ($1, $2, $3, $2)`,
    [randomUUID(), id, role],
  );
  if (kind === 'volunteer')
    await db
      .query(`INSERT INTO volunteers (id, user_id) VALUES ($1, $2)`, [randomUUID(), id])
      .catch(() => undefined);
  return { id, email, mobile, loginId: email ?? mobile };
}

/** The one Main Admin of the database (a unique index allows one), created on first use. */
export async function systemOwner(db: Client): Promise<Account> {
  const existing = await db.query(
    'SELECT id, email, mobile FROM users WHERE is_system_owner LIMIT 1',
  );
  const row = existing.rows[0] as { id: string; email: string; mobile: string } | undefined;
  if (row) return { id: row.id, email: row.email, mobile: row.mobile, loginId: row.email };
  return account(db, { role: 'department_head', systemOwner: true });
}

export interface Session {
  accessToken: string;
  refreshCookie: string;
  csrf: string;
  cookieHeader: string;
  body: Record<string, unknown>;
}

/** Cookie value of a Set-Cookie header list. */
function cookie(setCookie: string[] | string | undefined, name: string): string {
  const list = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const line = list.find((c) => c.startsWith(`${name}=`));
  if (!line) throw new Error(`cookie ${name} not set`);
  return decodeURIComponent(line.slice(name.length + 1).split(';')[0] ?? '');
}

export function sessionFrom(res: request.Response): Session {
  const refreshCookie = cookie(res.headers['set-cookie'], 'css_refresh');
  const csrf = cookie(res.headers['set-cookie'], 'css_csrf');
  return {
    accessToken: res.body.data.accessToken as string,
    refreshCookie,
    csrf,
    cookieHeader: `css_refresh=${encodeURIComponent(refreshCookie)}; css_csrf=${encodeURIComponent(csrf)}`,
    body: res.body.data as Record<string, unknown>,
  };
}

export async function login(
  h: AuthHarness,
  who: Account | string,
  options: { password?: string; platform?: string } = {},
): Promise<Session> {
  const res = await request(h.server())
    .post('/api/v1/auth/login')
    .send({
      loginId: typeof who === 'string' ? who : who.loginId,
      password: options.password ?? PASSWORD,
      device: { name: 'Test device', platform: options.platform ?? 'android', appVersion: '1.0.0' },
    });
  if (res.status !== 200)
    throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`);
  return sessionFrom(res);
}

export const bearer = (s: Session) => ({ Authorization: `Bearer ${s.accessToken}` });

/** Audit rows of an action, newest last. */
export async function auditRows(db: Client, action: string) {
  const res = await db.query(
    `SELECT actor_user_id, entity_type, entity_id, old, new, reason, device_session_id, ip
       FROM audit_log WHERE action = $1 ORDER BY created_at, id`,
    [action],
  );
  return res.rows as Record<string, unknown>[];
}
