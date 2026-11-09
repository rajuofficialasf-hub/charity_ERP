import type { IncomingMessage, ServerResponse } from 'node:http';
import type { DestinationStream } from 'pino';
import type { Options } from 'pino-http';
import type { Env } from '../config/env';
import { currentContext } from './request-context';
import { requestIdOf } from './request-id';

/**
 * Field names that never reach a log line (SYSTEM_ARCHITECTURE 9 and 10, SECURITY_POLICY):
 * secrets, OTP codes and personal data. Matched at any of the first three levels of a log object.
 */
export const SENSITIVE_KEYS = [
  'password',
  'newPassword',
  'currentPassword',
  'token',
  'accessToken',
  'refreshToken',
  'deviceKey',
  'previousDeviceKey',
  'authorization',
  'cookie',
  'otp',
  'code',
  'nid',
  'nidNumber',
  'birthReg',
  'birthRegNumber',
  'mobile',
  'phone',
  'email',
  'bankAccount',
  'accountNumber',
  'bankAccountNumber',
  'branchName',
  'dateOfBirth',
  'bloodGroup',
  'educationDetails',
  'permanentAddress',
  'facebookId',
  'professionDetails',
  // the value of a change request: it may be a protected one (NID, blood group, guardian)
  'newValue',
  'bankAccountName',
  'bankRoutingNumber',
  'bank',
  'referenceNid',
  'registrationToken',
  'x-registration-token',
  'mobileCode',
  'emailCode',
  'address',
  'secret',
];

export const REDACT_PATHS = SENSITIVE_KEYS.flatMap((key) => [key, `*.${key}`, `*.*.${key}`]);

/** The public link's token sits in the path of the public form routes; it is the whole access. */
const PUBLIC_TOKEN_PATH = /(\/public\/forms\/)[^/?]+/;

/** Logged form of a request: method, path without query string (the public token masked), ids. */
function requestSerializer(req: IncomingMessage & { id?: string }) {
  const path = (req.url ?? '').split('?')[0] ?? '';
  return { id: req.id, method: req.method, path: path.replace(PUBLIC_TOKEN_PATH, '$1[redacted]') };
}

function responseSerializer(res: ServerResponse) {
  return { statusCode: res.statusCode };
}

/**
 * pino-http options: one structured line per request with request id, user id, path, status and
 * latency; never bodies, query strings, cookies or authorization headers.
 */
export function loggerOptions(env: Env, stream?: DestinationStream): Options {
  return {
    level: env.LOG_LEVEL,
    genReqId: (req, res) => {
      const id = requestIdOf(req);
      res.setHeader('X-Request-Id', id);
      return id;
    },
    serializers: { req: requestSerializer, res: responseSerializer },
    customProps: () => {
      const ctx = currentContext();
      return ctx?.userId ? { userId: ctx.userId } : {};
    },
    redact: { paths: REDACT_PATHS, censor: '[redacted]' },
    autoLogging: { ignore: (req) => req.url === '/health/live' },
    ...(stream ? { stream } : {}),
  };
}
