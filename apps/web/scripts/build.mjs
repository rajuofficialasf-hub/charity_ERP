// Production build (`pnpm build`) and the E2E build (`pnpm build:e2e`, `--e2e`): the E2E build
// adds the dev-only gallery route and the dummy-OTP hint (BD-49); the E2E API address is given to
// `vite preview` by playwright.config.ts. The fonts come with the build (the asf fontsource packages).
import { spawnSync } from 'node:child_process';

const e2e = process.argv.includes('--e2e');
const env = {
  ...process.env,
  // always a production build, whatever NODE_ENV the caller has (CI runs its tests with `test`,
  // which would make Vite ship React's development build and double the first route)
  NODE_ENV: 'production',
  ...(e2e
    ? {
        VITE_DEV_GALLERY: '1',
        VITE_OTP_DUMMY: '1',
      }
    : {}),
};
// a normal build never takes the gallery or the dummy-OTP hint from the caller's environment
if (!e2e) {
  delete env.VITE_DEV_GALLERY;
  delete env.VITE_OTP_DUMMY;
}
// node runs without a shell (the repository path may contain spaces); tsc and vite are .cmd
// shims on Windows and need one.
const steps = [
  ['tsc', ['--noEmit'], process.platform === 'win32'],
  ['vite', ['build'], process.platform === 'win32'],
];
for (const [command, args, shell] of steps) {
  const result = spawnSync(command, args, { stdio: 'inherit', env, shell });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
