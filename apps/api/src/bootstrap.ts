import { type INestApplication, RequestMethod } from '@nestjs/common';

export const API_PREFIX = 'api/v1';

/** Application-wide HTTP setup shared by main.ts and the API tests, so both behave the same. */
export function configureApp(app: INestApplication): INestApplication {
  app.setGlobalPrefix(API_PREFIX, {
    exclude: [{ path: 'health/live', method: RequestMethod.GET }],
  });
  app.enableShutdownHooks();
  return app;
}
