import { type INestApplication, RequestMethod } from '@nestjs/common';
import type { Express } from 'express';
import { Logger } from 'nestjs-pino';
import { ENV, type Env } from './config/env';

export const API_PREFIX = 'api/v1';

/** Application-wide HTTP setup shared by main.ts and the API tests, so both behave the same. */
export function configureApp(app: INestApplication): INestApplication {
  // The client address comes from X-Forwarded-For only through trusted proxies (D-072).
  const env = app.get<Env>(ENV);
  (app.getHttpAdapter().getInstance() as Express).set('trust proxy', env.TRUST_PROXY);
  app.setGlobalPrefix(API_PREFIX, {
    exclude: [
      { path: 'health/live', method: RequestMethod.GET },
      { path: 'health/ready', method: RequestMethod.GET },
    ],
  });
  // Nest's own logger writes through pino with the request context (SYSTEM_ARCHITECTURE 10).
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
  return app;
}
