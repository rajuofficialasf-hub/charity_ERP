/**
 * Project components of BR-063 (D-062). Projects are assembled from these; nothing
 * project-specific is hard-coded (BD-09). `project_components.component_key` stores the key.
 */
export const COMPONENT_KEYS = [
  'application_form',
  'public_link',
  'volunteer_assignment',
  'dispatch_receive',
  'distribution',
  'site_verification',
  'stages',
  'issue_log',
  'dawah',
  'exams',
  'beneficiary_payment',
  'materials_placard',
  'vouchers',
  'volunteer_expenses',
  'donors_animals',
  'follow_up',
  'rating_criteria',
  'document_checklist',
] as const;

export type ComponentKey = (typeof COMPONENT_KEYS)[number];

export function isComponentKey(value: string): value is ComponentKey {
  return (COMPONENT_KEYS as readonly string[]).includes(value);
}
