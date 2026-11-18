import type { z } from 'zod';
import { reviewChecklistSettings } from '../jsonb/component-settings.js';

/** A project's review checklist: its items and whether every item must be answered first. */
export type ReviewChecklist = z.infer<typeof reviewChecklistSettings>;
export type ReviewChecklistItem = ReviewChecklist['items'][number];

/**
 * The checklist of a project that says nothing: the identity, the address and the eligibility
 * checked, none of them required before sending (docs/BUSINESS_RULES.md, "Application workflow").
 */
export const DEFAULT_REVIEW_CHECKLIST: ReviewChecklist = {
  required: false,
  // the starting items are bilingual data a project keeps in its settings once the PM saves the
  // checklist, as the shipped reference lists are, not text of a screen
  items: [
    { code: 'identity', label: { bn: 'পরিচয় যাচাই', en: 'Identity checked' } }, // i18n-allow-bengali: starting checklist data
    { code: 'address', label: { bn: 'ঠিকানা যাচাই', en: 'Address checked' } }, // i18n-allow-bengali: starting checklist data
    { code: 'eligibility', label: { bn: 'যোগ্যতা যাচাই', en: 'Eligibility checked' } }, // i18n-allow-bengali: starting checklist data
  ],
};

/**
 * The checklist of a project, read from the stored settings of its application form component.
 * A project without the key, or with a value the schema does not take, reads the starting
 * checklist whole; the API, the screens and the setup read it through this function only.
 */
export function reviewChecklist(settings: unknown): ReviewChecklist {
  const stored =
    typeof settings === 'object' && settings !== null && !Array.isArray(settings)
      ? (settings as { review_checklist?: unknown }).review_checklist
      : undefined;
  const parsed = reviewChecklistSettings.safeParse(stored);
  return parsed.success ? parsed.data : DEFAULT_REVIEW_CHECKLIST;
}
