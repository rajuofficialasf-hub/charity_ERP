import { z } from 'zod';

/**
 * The four rules texts of a project that every assigned volunteer reads and accepts before working
 * on it (BR-039): the volunteer's duties, the implementation process, the Local দায়ী's duties and
 * the consequences of misconduct. Each is bilingual; the Local দায়ী part matters only while the
 * project runs dawah classes.
 */
export const RULES_PARTS = [
  'volunteer_duties',
  'implementation_process',
  'daee_duties',
  'misconduct',
] as const;
export type RulesPart = (typeof RULES_PARTS)[number];

/** One rules text in both languages; long enough for a page of rules, never unbounded. */
const ruleText = z.strictObject({ bn: z.string().max(10_000), en: z.string().max(10_000) });

/** `projects.rules` and the body that saves them: any part may be absent while a draft is set up. */
export const projectRulesSchema = z.strictObject({
  volunteer_duties: ruleText.optional(),
  implementation_process: ruleText.optional(),
  daee_duties: ruleText.optional(),
  misconduct: ruleText.optional(),
});
export type ProjectRules = z.infer<typeof projectRulesSchema>;

/** The parts a volunteer must accept, and activation needs: the Local দায়ী part only with dawah. */
export function requiredRuleParts(dawahEnabled: boolean): RulesPart[] {
  return RULES_PARTS.filter((part) => dawahEnabled || part !== 'daee_duties');
}

/** The required parts whose text is empty in either language. Unreadable rules miss every part. */
export function missingRuleParts(rules: unknown, dawahEnabled: boolean): RulesPart[] {
  const parsed = projectRulesSchema.safeParse(rules);
  const texts: ProjectRules = parsed.success ? parsed.data : {};
  return requiredRuleParts(dawahEnabled).filter((part) => {
    // eslint-disable-next-line security/detect-object-injection -- part comes from RULES_PARTS
    const text = texts[part];
    return !text?.bn.trim() || !text.en.trim();
  });
}

/**
 * A volunteer's answer to the rules of a project: the version read, accept or refuse, and the parts
 * accepted one by one. An acceptance must name every required part of that version (the server
 * checks it against the project).
 */
export const consentSchema = z.strictObject({
  rulesVersion: z.number().int().min(1),
  decision: z.enum(['accepted', 'refused']),
  parts: z
    .array(z.enum(RULES_PARTS))
    .max(RULES_PARTS.length)
    .refine((parts) => new Set(parts).size === parts.length, 'a part appears twice')
    .default([]),
});
export type Consent = z.infer<typeof consentSchema>;

/** Whether an acceptance names every part the volunteer had to read. */
export function acceptsEveryPart(parts: readonly RulesPart[], dawahEnabled: boolean): boolean {
  return requiredRuleParts(dawahEnabled).every((part) => parts.includes(part));
}
