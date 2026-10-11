import type { Express, Router } from 'express';
import { createApp } from '../../src/app';
import type { Env } from '../../src/config/env';
import {
  closeContainer,
  type Container,
  type ContainerOptions,
  createContainer,
} from '../../src/container';
import { testEnv } from './env';

export interface TestApp {
  app: Express;
  container: Container;
  close: () => Promise<void>;
}

/**
 * The real Express app for Supertest (TS-01), built exactly as server.ts builds it, on the test
 * configuration with optional service overrides and extra probe routers.
 */
export function buildTestApp(
  options: {
    env?: Env;
    envOverrides?: Record<string, string>;
    overrides?: ContainerOptions['overrides'];
    logStream?: ContainerOptions['logStream'];
    routers?: Router[];
  } = {},
): TestApp {
  const env = options.env ?? testEnv(options.envOverrides);
  const container = createContainer(env, {
    overrides: options.overrides,
    logStream: options.logStream,
  });
  const app = createApp(container, { logStream: options.logStream, extraRouters: options.routers });
  return { app, container, close: () => closeContainer(container) };
}
