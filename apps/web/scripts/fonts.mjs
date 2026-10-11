// Copies the design-system fonts and their licence texts into public/fonts (served at /fonts/,
// D-065) before `vite dev` and `vite build`.
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const source = dirname(fileURLToPath(import.meta.resolve('@css/ui/fonts/Bornomala-Regular.woff2')));
const target = join(here, '..', 'public', 'fonts');

mkdirSync(target, { recursive: true });
for (const file of readdirSync(source)) copyFileSync(join(source, file), join(target, file));
