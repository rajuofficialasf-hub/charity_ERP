import rule from '@css/config/eslint-rules/no-literal-ui-text';
import { RuleTester } from 'eslint';
import { describe, it } from 'vitest';

// The lint layer of docs/ui/I18N.md, "No hard-coded strings: rule and enforcement": a hard-coded
// user-facing string fails CI.
RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const tester = new RuleTester({
  // The default parser reads JSX; the rule needs no type information.
  languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
});

tester.run('css/no-literal-ui-text', rule, {
  valid: [
    { code: 'const a = <p>{t("home.title")}</p>;' },
    { code: 'const a = <Button aria-label={t("common.action.close")} />;' },
    { code: 'const a = <span aria-hidden="true">-</span>;' },
    { code: 'const a = <span>{"·"} {count}</span>;' },
    { code: 'const a = <StatCard prefix="৳" value={1} label={t("x")} />;' },
    { code: 'const a = <div className="flex gap-2" data-testid="table-state" id="name" />;' },
    { code: 'const a = <input type="text" inputMode="numeric" />;' },
  ],
  invalid: [
    { code: 'const a = <p>Approve application</p>;', errors: [{ messageId: 'text' }] },
    { code: 'const a = <h1>চ্যারিটি ও সোশ্যাল সার্ভিস</h1>;', errors: [{ messageId: 'text' }] },
    { code: 'const a = <p>{"Hard-coded"}</p>;', errors: [{ messageId: 'text' }] },
    { code: 'const a = <Button aria-label="Close" />;', errors: [{ messageId: 'prop' }] },
    { code: 'const a = <TextField label={"নাম"} />;', errors: [{ messageId: 'prop' }] },
    { code: 'const a = <img alt={`Logo`} />;', errors: [{ messageId: 'prop' }] },
    {
      code: 'const a = <Alert title="Saved" message="Done" />;',
      errors: [{ messageId: 'prop' }, { messageId: 'prop' }],
    },
  ],
});
