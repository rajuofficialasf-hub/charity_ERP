import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { errors, jwtVerify, SignJWT } from 'jose';
import type { Env } from '../config/env';
import type { Clock } from '../core/clock';
import { ApiError } from '../i18n/api-error';

/** Access-token lifetime (O-05). */
export const ACCESS_TOKEN_SECONDS = 15 * 60;

/** Claims of an access token (AUTH.md 5): no permissions, scopes or personal data. */
export interface AccessClaims {
  sub: string;
  sid: string;
  roles: string[];
  pv: number;
}

interface SigningKey {
  kid: string;
  key: Uint8Array;
}

function signingKey(secret: string): SigningKey {
  return {
    kid: createHash('sha256').update(secret).digest('base64url').slice(0, 12),
    key: new TextEncoder().encode(secret),
  };
}

/** SHA-256 of a refresh token; only the hash is stored (AUTH.md 5). */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('base64url');
}

/**
 * Access tokens (JWT HS256 with a key id, D-070), opaque refresh tokens and the signed
 * double-submit CSRF token of the refresh endpoint.
 */
export class TokenService {
  private readonly current: SigningKey;
  private readonly keys: Map<string, SigningKey>;

  constructor(
    private readonly env: Env,
    private readonly clock: Clock,
  ) {
    this.current = signingKey(env.JWT_SECRET);
    this.keys = new Map([[this.current.kid, this.current]]);
    if (env.JWT_PREVIOUS_SECRET) {
      const previous = signingKey(env.JWT_PREVIOUS_SECRET);
      this.keys.set(previous.kid, previous);
    }
  }

  async signAccess(claims: AccessClaims): Promise<{ token: string; expiresAt: Date }> {
    const issuedAt = Math.floor(this.clock.now().getTime() / 1000);
    const exp = issuedAt + ACCESS_TOKEN_SECONDS;
    const token = await new SignJWT({ sid: claims.sid, roles: claims.roles, pv: claims.pv })
      .setProtectedHeader({ alg: 'HS256', kid: this.current.kid, typ: 'JWT' })
      .setSubject(claims.sub)
      .setIssuedAt(issuedAt)
      .setExpirationTime(exp)
      .sign(this.current.key);
    return { token, expiresAt: new Date(exp * 1000) };
  }

  /** Verified claims; an expired token is `auth.token_expired`, anything else invalid is missing. */
  async verifyAccess(token: string): Promise<AccessClaims> {
    try {
      const { payload } = await jwtVerify(
        token,
        (header) => {
          const key = header.kid ? this.keys.get(header.kid) : undefined;
          if (!key) throw new errors.JWSSignatureVerificationFailed();
          return key.key;
        },
        { algorithms: ['HS256'], currentDate: this.clock.now() },
      );
      const { sub, sid, roles, pv } = payload as Partial<AccessClaims>;
      if (
        typeof sub !== 'string' ||
        typeof sid !== 'string' ||
        !Array.isArray(roles) ||
        typeof pv !== 'number'
      )
        throw new ApiError('auth.token_missing', 401);
      return { sub, sid, roles: roles.map(String), pv };
    } catch (error) {
      if (error instanceof errors.JWTExpired) throw new ApiError('auth.token_expired', 401);
      if (error instanceof ApiError) throw error;
      throw new ApiError('auth.token_missing', 401);
    }
  }

  /**
   * A new refresh token: the session id, a dot and 256 random bits (D-070). The id lets the rate
   * limiter count refreshes per session; only the random part makes the token unguessable.
   */
  newRefreshToken(sessionId: string): string {
    return `${sessionId}.${randomBytes(32).toString('base64url')}`;
  }

  /** CSRF token bound to a device session: `nonce.HMAC(secret, sid|nonce)` (D-070). */
  csrfToken(sessionId: string): string {
    const nonce = randomBytes(16).toString('base64url');
    return `${nonce}.${this.csrfMac(sessionId, nonce)}`;
  }

  csrfValid(sessionId: string, token: string): boolean {
    const [nonce, mac] = token.split('.');
    if (!nonce || !mac) return false;
    const expected = Buffer.from(this.csrfMac(sessionId, nonce));
    const given = Buffer.from(mac);
    return expected.length === given.length && timingSafeEqual(expected, given);
  }

  private csrfMac(sessionId: string, nonce: string): string {
    return createHmac('sha256', this.env.AUTH_CSRF_SECRET)
      .update(`${sessionId}|${nonce}`)
      .digest('base64url');
  }
}
