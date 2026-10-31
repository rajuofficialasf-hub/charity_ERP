import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

/**
 * The device key of a session (docs/architecture/AUTH.md "Tokens and device sessions"): 32 random
 * bytes the phone receives at login and refresh and keeps in memory only, which wrap the key of
 * its encrypted offline store. The row holds the key sealed under the server's secret, bound to
 * the session id, so a database copy alone or a value moved to another row opens nothing.
 */

const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const HKDF_SALT = 'css-local-key';

function sealingKey(secret: string): Buffer {
  return Buffer.from(hkdfSync('sha256', secret, HKDF_SALT, 'device-local-key', KEY_BYTES));
}

export function newLocalKey(): Buffer {
  return randomBytes(KEY_BYTES);
}

/** The form the phone receives. */
export function encodeLocalKey(key: Buffer): string {
  return key.toString('base64url');
}

/** `iv || tag || ciphertext`, with the session id as associated data. */
export function sealLocalKey(
  key: Buffer,
  sessionId: string,
  secret: string,
): Uint8Array<ArrayBuffer> {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', sealingKey(secret), iv, {
    authTagLength: TAG_BYTES,
  });
  cipher.setAAD(Buffer.from(sessionId));
  const sealed = Buffer.concat([cipher.update(key), cipher.final()]);
  const out = new Uint8Array(new ArrayBuffer(IV_BYTES + TAG_BYTES + sealed.length));
  out.set(iv, 0);
  out.set(cipher.getAuthTag(), IV_BYTES);
  out.set(sealed, IV_BYTES + TAG_BYTES);
  return out;
}

/**
 * The key back from its sealed form, tried with each secret in turn (the current one first, the
 * previous one during a rotation); null when none of them opens it for this session.
 */
export function openLocalKey(
  sealedBytes: Uint8Array,
  sessionId: string,
  secrets: string[],
): Buffer | null {
  const sealed = Buffer.from(sealedBytes);
  if (sealed.length !== IV_BYTES + TAG_BYTES + KEY_BYTES) return null;
  const iv = sealed.subarray(0, IV_BYTES);
  const tag = sealed.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const body = sealed.subarray(IV_BYTES + TAG_BYTES);
  for (const secret of secrets) {
    try {
      const decipher = createDecipheriv('aes-256-gcm', sealingKey(secret), iv, {
        authTagLength: TAG_BYTES,
      });
      decipher.setAAD(Buffer.from(sessionId));
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(body), decipher.final()]);
    } catch {
      // not this secret, or not this session
    }
  }
  return null;
}
