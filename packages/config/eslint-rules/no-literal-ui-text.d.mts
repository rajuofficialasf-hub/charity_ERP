import type { Rule } from 'eslint';

/**
 * Types of the local ESLint rule css/no-literal-ui-text (docs/ui/I18N.md, "No hard-coded strings:
 * rule and enforcement").
 */
declare const rule: Rule.RuleModule;
export default rule;
export declare const TEXT_PROPS: Set<string>;
