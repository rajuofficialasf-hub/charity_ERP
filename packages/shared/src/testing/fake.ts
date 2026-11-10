/**
 * Obviously fake identities for seeds and test fixtures (docs/testing/TEST_STRATEGY.md, "Test data
 * strategy"). Each value passes the production format checks but sits in a reserved range, so it
 * can never be a real person's data and a production guard can recognise it.
 */
export const FAKE = {
  nidBase: 1000000000, // NIDs 1000000000 to 1000099999
  nidCount: 100000,
  birthRegPrefix: '1000000', // 17 digits in total
  mobilePrefix: '0170000', // 0170000xxxx
  emailDomain: 'example.org',
  nameMarker: '(নমুনা)',
} as const;

export function fakeNid(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n >= FAKE.nidCount)
    throw new Error(`fake NID index ${n} out of range`);
  return String(FAKE.nidBase + n);
}

export function fakeBirthReg(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 9_999_999_999)
    throw new Error(`fake birth registration index ${n} out of range`);
  return FAKE.birthRegPrefix + String(n).padStart(10, '0');
}

export function fakeMobile(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 9999)
    throw new Error(`fake mobile index ${n} out of range`);
  return FAKE.mobilePrefix + String(n).padStart(4, '0');
}

export function fakeEmail(localPart: string): string {
  return `${localPart}@${FAKE.emailDomain}`;
}

export function demoName(name: string): string {
  return `${name} ${FAKE.nameMarker}`;
}

const NID_RE = /^10000\d{5}$/;
export const isFakeNid = (v: string) => NID_RE.test(v);
export const isFakeBirthReg = (v: string) =>
  v.length === 17 && v.startsWith(FAKE.birthRegPrefix) && /^\d+$/.test(v);
export const isFakeMobile = (v: string) =>
  v.length === 11 && v.startsWith(FAKE.mobilePrefix) && /^\d+$/.test(v);
export const isFakeEmail = (v: string) => v.endsWith('@' + FAKE.emailDomain);
export const isDemoName = (v: string) => v.endsWith(FAKE.nameMarker);
