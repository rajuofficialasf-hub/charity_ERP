import { checkPassword, hasDigit, hasUppercase, PASSWORD_MIN_LENGTH } from '@css/shared/auth';
import { formatCount } from '@css/shared/format';
import type { Locale } from '@css/shared/i18n';
import { Check, Circle } from 'lucide-react';
import { useLocale, useTranslations } from 'use-intl';

/**
 * The password rule as a checklist that ticks while the person types (AUTH.md 3, O-64): the
 * length, an upper-case letter and a digit. A met rule shows a check and an unmet one an empty
 * circle, so the state is never colour alone. The API enforces the rule, including the longer
 * minimum for GLOBAL-scope officials; this list is a hint.
 */
export function PasswordRules({ password, id }: { password: string; id: string }) {
  const t = useTranslations('auth.password');
  const locale = useLocale() as Locale;
  const long = !checkPassword(password, { minLength: PASSWORD_MIN_LENGTH }).includes(
    'validation.password_too_short',
  );
  const rules = [
    {
      key: 'length',
      text: t('rule_length', { min: formatCount(PASSWORD_MIN_LENGTH, locale) }),
      met: long,
    },
    { key: 'uppercase', text: t('rule_uppercase'), met: hasUppercase(password) },
    { key: 'digit', text: t('rule_digit'), met: hasDigit(password) },
  ];
  return (
    <div id={id}>
      <p className="m-0">{t('rules_title')}</p>
      <ul className="rule-list">
        {rules.map((rule) => (
          <li key={rule.key} data-met={rule.met}>
            {rule.met ? (
              <Check size={16} aria-hidden="true" />
            ) : (
              <Circle size={16} aria-hidden="true" />
            )}
            <span>{rule.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
