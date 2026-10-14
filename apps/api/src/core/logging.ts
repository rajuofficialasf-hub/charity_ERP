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
  'emergencyContact',
  'emergencyContactName',
  'emergencyContactMobile',
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

/** Logged form of a request: method, path without query string, request and user ids. */
function requestSerializer(req: IncomingMessage & { id?: string }) {
  return { id: req.id, method: req.method, path: (req.url ?? '').split('?')[0] };
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
