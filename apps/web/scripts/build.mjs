// Production build (`pnpm build`) and the E2E build (`pnpm build:e2e`, `--e2e`): the E2E build
// adds the dev-only gallery route and the dummy-OTP hint (BD-49); the E2E API address is given to
// `vite preview` by playwright.config.ts. Fonts are copied first (scripts/fonts.mjs).
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const e2e = process.argv.includes('--e2e');
const env = {
  ...process.env,
  ...(e2e
    ? {
        VITE_DEV_GALLERY: '1',
        VITE_OTP_DUMMY: '1',
      }
    : {}),
};
// node runs without a shell (the repository path may contain spaces); tsc and vite are .cmd
// shims on Windows and need one.
const steps = [
  [process.execPath, [join(here, 'fonts.mjs')], false],
  ['tsc', ['--noEmit'], process.platform === 'win32'],
  ['vite', ['build'], process.platform === 'win32'],
];
for (const [command, args, shell] of steps) {
  const result = spawnSync(command, args, { stdio: 'inherit', env, shell });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
