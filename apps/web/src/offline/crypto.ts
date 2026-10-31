/**
 * The cryptography of the phone's store (docs/architecture/OFFLINE_SYNC.md, local storage
 * security): AES-GCM
 * through WebCrypto. One data key seals every secret field with its own IV; the data key's raw
 * bytes are wrapped under the device key the server issues for the session and under a
 * device-bound key the browser holds, so the store opens with either. Nothing here touches
 * IndexedDB, and no key ever leaves this module as bytes except the data key at its birth.
 */

const ALGORITHM = 'AES-GCM';
const KEY_BITS = 256;
const IV_BYTES = 12;

/** A sealed value: the IV it was sealed with and the ciphertext with its tag. */
export interface Sealed {
  iv: Uint8Array<ArrayBuffer>;
  data: ArrayBuffer;
}

const subtle = () => globalThis.crypto.subtle;

/** Fresh random bytes for a data key. */
export function newKeyBytes(): Uint8Array<ArrayBuffer> {
  return globalThis.crypto.getRandomValues(new Uint8Array(KEY_BITS / 8));
}

/** The working data key: usable for sealing and opening, never exportable. */
export function importDataKey(raw: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  return subtle().importKey('raw', raw, ALGORITHM, false, ['encrypt', 'decrypt']);
}

/** The server's device key (base64url of 32 bytes) as a key that wraps the data key; memory only. */
export function importDeviceKey(base64url: string): Promise<CryptoKey> {
  return subtle().importKey('raw', fromBase64Url(base64url), ALGORITHM, false, [
    'encrypt',
    'decrypt',
  ]);
}

/** A key this browser alone holds: generated non-extractable, kept as a CryptoKey in IndexedDB. */
export function newDeviceBoundKey(): Promise<CryptoKey> {
  return subtle().generateKey({ name: ALGORITHM, length: KEY_BITS }, false, ['encrypt', 'decrypt']);
}

export async function seal(key: CryptoKey, plain: Uint8Array<ArrayBuffer>): Promise<Sealed> {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const data = await subtle().encrypt({ name: ALGORITHM, iv }, key, plain);
  return { iv, data };
}

/** Opens a sealed value; a wrong key or a changed byte throws. */
export async function open(key: CryptoKey, sealed: Sealed): Promise<Uint8Array<ArrayBuffer>> {
  const plain = await subtle().decrypt({ name: ALGORITHM, iv: sealed.iv }, key, sealed.data);
  return new Uint8Array(plain);
}

export function sealJson(key: CryptoKey, value: unknown): Promise<Sealed> {
  return seal(key, new TextEncoder().encode(JSON.stringify(value)));
}

export async function openJson<T>(key: CryptoKey, sealed: Sealed): Promise<T> {
  return JSON.parse(new TextDecoder().decode(await open(key, sealed))) as T;
}

/** The data key's bytes under a wrapping key: the same sealing, named for what it holds. */
export const wrapKey = seal;
export const unwrapKey = open;

export function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
