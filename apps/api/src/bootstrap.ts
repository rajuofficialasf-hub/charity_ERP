import { type INestApplication, RequestMethod } from '@nestjs/common';
import { Logger } from 'nestjs-pino';

export const API_PREFIX = 'api/v1';

/** Application-wide HTTP setup shared by main.ts and the API tests, so both behave the same. */
export function configureApp(app: INestApplication): INestApplication {
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
