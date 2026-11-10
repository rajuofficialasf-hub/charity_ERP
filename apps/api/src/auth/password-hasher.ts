import { hash, verify } from '@node-rs/argon2';

/**
 * Argon2id parameters (SECURITY_POLICY 4): 19 MiB memory, 2 passes, 1 lane, the OWASP
 * minimum. `algorithm: 2` is Argon2id (the library's enum is a const enum).
 */
export const ARGON2_OPTIONS = {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
  algorithm: 2,
} as const;

const CURRENT_PREFIX = `$argon2id$v=19$m=${ARGON2_OPTIONS.memoryCost},t=${ARGON2_OPTIONS.timeCost},p=${ARGON2_OPTIONS.parallelism}$`;

/** Password hashing and verification; plaintext never leaves this class (AUTH.md 1). */
export class PasswordHasher {
  private dummy?: Promise<string>;

  hash(password: string): Promise<string> {
    return hash(password, ARGON2_OPTIONS);
  }

  /**
   * True when the password matches. Without a stored hash (unknown login id, system actor) a
   * dummy hash is verified anyway, so both cases take the same time (AUTH.md 4, no enumeration).
   */
  async verify(stored: string | null | undefined, password: string): Promise<boolean> {
    const target = stored ?? (await this.dummyHash());
    let ok: boolean;
    try {
      ok = await verify(target, password);
    } catch {
      ok = false;
    }
    return ok && Boolean(stored);
  }

  /** A stored hash made with other parameters is replaced at the next successful login. */
  needsRehash(stored: string): boolean {
    return !stored.startsWith(CURRENT_PREFIX);
  }

  private dummyHash(): Promise<string> {
    this.dummy ??= hash('dummy-password-for-timing-only', ARGON2_OPTIONS);
    return this.dummy;
  }
}
