import type { Express } from 'express';
import { type AppOptions, createApp } from '../../src/app.js';
import type { Env } from '../../src/config/env.js';
import {
  closeContainer,
  type Container,
  type ContainerOptions,
  createContainer,
} from '../../src/container.js';
import type { RouteRegistry } from '../../src/openapi/registry.js';
import { contractRecorder } from './contract.js';
import { withAppOrigin } from './origin.js';
import { testEnv } from './env.js';

export interface TestApp {
  app: Express;
  registry: RouteRegistry;
  container: Container;
  close: () => Promise<void>;
}

/**
 * The real Express app for Supertest, built exactly as server.ts builds it, on the test
 * configuration with optional service overrides and extra probe routers.
 */
export function buildTestApp(
  options: {
    env?: Env;
    envOverrides?: Record<string, string>;
    overrides?: ContainerOptions['overrides'];
    logStream?: ContainerOptions['logStream'];
    routers?: AppOptions['extraRouters'];
  } = {},
): TestApp {
  const env = options.env ?? testEnv(options.envOverrides);
  const container = createContainer(env, {
    overrides: options.overrides,
    logStream: options.logStream,
  });
  const { app, registry } = createApp(container, {
    logStream: options.logStream,
    extraRouters: options.routers,
  });
  // every JSON response is checked against the contract (test/support/contract.ts)
  return {
    app: withAppOrigin(contractRecorder.wrap(app), env.APP_ORIGIN),
    registry,
    container,
    close: () => closeContainer(container),
  };
}
