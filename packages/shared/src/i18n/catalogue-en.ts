/* The English catalogue, the start part and the rest part together (docs/ui/I18N.md, "Layout"). */
import type { Messages } from './catalogue-bn.js';
import { enRest } from './en-rest.js';
import { enStart } from './en-start.js';

/** English has exactly the keys of bn: each part is typed by the bn catalogue. */
export const en: Messages = { ...enStart, ...enRest };
