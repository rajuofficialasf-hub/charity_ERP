import type { Env } from '../config/env.js';

/** What a scan says about a file: no threat, a threat, or no scan at all (development and test). */
export type ScanResult = 'clean' | 'infected' | 'skipped';

/**
 * The virus-scan hook (docs/architecture/FILES_AND_DOCUMENTS.md, "Validation table", scan policy):
 * every uploaded file stays quarantined until a scanner clears it. A scanner that fails or times
 * out throws; the caller keeps the file quarantined and retries, never treating it as clean.
 */
export interface Scanner {
  readonly name: string;
  scan(bytes: Buffer): Promise<ScanResult>;
}

/**
 * Development and test only: marks every file `skipped`, which the access rules treat as viewable
 * outside production. Production refuses to start with it (config/env.ts); the organization's
 * scanner, ClamAV on its own server by default, is installed before the first deployment.
 */
export const skippingScanner: Scanner = {
  name: 'skip',
  scan: () => Promise.resolve('skipped'),
};

/** The scanner the configuration names. */
export function createScanner(env: Pick<Env, 'FILE_SCANNER'>): Scanner {
  switch (env.FILE_SCANNER) {
    case 'skip':
      return skippingScanner;
  }
}
