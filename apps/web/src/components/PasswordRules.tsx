import { checkPassword, PASSWORD_MIN_LENGTH } from '@css/shared/auth';
import { formatCount } from '@css/shared/format';
import type { Locale } from '@css/shared/i18n';
import { useLocale, useTranslations } from 'use-intl';

/**
 * Live hints for a new password (AUTH.md 3): length, letter and digit. The server applies every
 * rule, including the common-password list and the longer minimum for GLOBAL-scope officials.
 */
export function PasswordRules({ password, id }: { password: string; id: string }) {
  const t = useTranslations('auth.password');
  const locale = useLocale() as Locale;
  const problems = checkPassword(password, { minLength: PASSWORD_MIN_LENGTH });
  const rules = [
    {
      key: 'length',
      text: t('rule_length', { min: formatCount(PASSWORD_MIN_LENGTH, locale) }),
      met: password.length > 0 && !problems.includes('validation.password_too_short'),
    },
    {
      key: 'letter_digit',
      text: t('rule_letter_digit'),
      met: password.length > 0 && !problems.includes('validation.password_letter_digit'),
    },
    { key: 'identity', text: t('rule_identity'), met: false },
  ];
  return (
    <div id={id}>
      <p className="m-0">{t('rules_title')}</p>
      <ul className="rule-list">
        {rules.map((rule) => (
          <li key={rule.key} data-met={rule.met}>
            {rule.text}
          </li>
        ))}
      </ul>
    </div>
  );
}
