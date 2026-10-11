// Copies the design-system fonts and their licence texts into public/fonts (served at /fonts/,
// D-065), then runs the given Next command. `--dev-gallery` adds the dev-only /dev/components
// gallery to a production build (used by the E2E build only; T1.4).
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const source = dirname(fileURLToPath(import.meta.resolve('@css/ui/fonts/Bornomala-Regular.woff2')));
const target = join(here, '..', 'public', 'fonts');

mkdirSync(target, { recursive: true });
for (const file of readdirSync(source)) copyFileSync(join(source, file), join(target, file));

const args = process.argv.slice(2);
const devGallery = args.includes('--dev-gallery');
const command = args.filter((a) => a !== '--dev-gallery');
if (command.length === 0) process.exit(0);

const env = { ...process.env, ...(devGallery ? { CSS_DEV_GALLERY: '1' } : {}) };
const result = spawnSync('next', command, {
  stdio: 'inherit',
  env,
  shell: process.platform === 'win32',
});
process.exit(result.status ?? 1);
