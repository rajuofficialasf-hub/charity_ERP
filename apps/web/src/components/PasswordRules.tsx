import { Icon, Text } from '@/ui';
import { hasDigit, hasUppercase, PASSWORD_MIN_LENGTH, passwordLength } from '@css/shared/auth';
import { formatCount } from '@css/shared/format';
import type { Locale } from '@css/shared/i18n';
import { useLocale, useTranslations } from 'use-intl';

/**
 * The password rule as a checklist that ticks while the person types (docs/architecture/AUTH.md,
 * "Password rules"): the length, an upper-case letter and a digit. A met rule shows a check and an
 * unmet one an empty circle, so the state is never colour alone. The API enforces the rule,
 * including the longer minimum for GLOBAL-scope officials; this list is a hint.
 */
export function PasswordRules({
  password,
  id,
  minLength = PASSWORD_MIN_LENGTH,
}: {
  password: string;
  id: string;
  /** The minimum for this account: longer for a GLOBAL-scope official (minPasswordLength). */
  minLength?: number;
}) {
  const t = useTranslations('auth.password');
  const locale = useLocale() as Locale;
  const long = passwordLength(password) >= minLength;
  const rules = [
    {
      key: 'length',
      text: t('rule_length', { min: formatCount(minLength, locale) }),
      met: long,
    },
    { key: 'uppercase', text: t('rule_uppercase'), met: hasUppercase(password) },
    { key: 'digit', text: t('rule_digit'), met: hasDigit(password) },
  ];
  return (
    <div id={id}>
      <Text>{t('rules_title')}</Text>
      <ul className="rule-list">
        {rules.map((rule) => (
          <li key={rule.key} data-met={rule.met}>
            {rule.met ? <Icon name="check" size={16} /> : <Icon name="radio" size={16} />}
            <span>{rule.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
