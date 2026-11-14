/* The Bengali catalogue, the start part and the rest part together (docs/ui/I18N.md, "Layout"). A
 * new namespace is imported in bn-start.ts or bn-rest.ts, as START_NAMESPACES in catalogue.ts
 * says, and in the English part of the same name. */
import { bnRest } from './bn-rest.js';
import { bnStart } from './bn-start.js';

/**
 * The bn catalogue is the source language; its shape types every key (docs/ui/I18N.md, "Typed keys
 * and loading").
 */
export const bn = { ...bnStart, ...bnRest };

export type Messages = typeof bn;
