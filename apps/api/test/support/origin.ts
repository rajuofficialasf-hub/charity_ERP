import express, { type Express } from 'express';

/**
 * A browser sends its page's origin with every write, so the tests' requests carry the app's own
 * origin unless they set one. A test that needs a request with no origin at all sends the header
 * `x-test-origin: none`; this helper removes both before the app sees the request.
 */
export function withAppOrigin(app: Express, appOrigin: string): Express {
  const origin = new URL(appOrigin).origin;
  const outer = express();
  outer.use((req, _res, next) => {
    if (req.headers['x-test-origin'] === 'none') {
      delete req.headers['x-test-origin'];
      delete req.headers.origin;
    } else if (req.headers.origin === undefined) req.headers.origin = origin;
    next();
  });
  outer.use(app);
  return outer;
}
