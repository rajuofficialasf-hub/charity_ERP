import { type INestApplication, RequestMethod } from '@nestjs/common';
import { ApiExceptionFilter } from './i18n/api-exception.filter';

export const API_PREFIX = 'api/v1';

/** Application-wide HTTP setup shared by main.ts and the API tests, so both behave the same. */
export function configureApp(app: INestApplication): INestApplication {
  app.setGlobalPrefix(API_PREFIX, {
    exclude: [{ path: 'health/live', method: RequestMethod.GET }],
  });
  // Errors in the request language (I18N 5, API_STANDARDS 3); T1.6 extends the envelope.
  app.useGlobalFilters(new ApiExceptionFilter());
  app.enableShutdownHooks();
  return app;
}
