/**
 * Money as whole paisa in BigInt, so sums and products are exact at any size (the planned budget
 * and the fund-source total are compared to the paisa). Amounts arrive as decimal strings with up
 * to two decimals, as the API and the numeric(14,2) columns give them.
 */
// eslint-disable-next-line security/detect-unsafe-regex -- bounded repetitions without nesting: linear
const AMOUNT = /^(\d{1,12})(?:\.(\d{1,2}))?$/;

/** Whether a string is an amount this module reads (not negative, at most two decimals). */
export function isAmount(amount: string): boolean {
  return AMOUNT.test(amount.trim());
}

export function toPaisa(amount: string): bigint {
  const match = AMOUNT.exec(amount.trim());
  if (!match) throw new RangeError(`not an amount: ${amount}`);
  return BigInt(match[1]!) * 100n + BigInt((match[2] ?? '').padEnd(2, '0'));
}

export function fromPaisa(paisa: bigint): string {
  return `${paisa / 100n}.${String(paisa % 100n).padStart(2, '0')}`;
}

export function sumPaisa(amounts: readonly string[]): bigint {
  return amounts.reduce((total, amount) => total + toPaisa(amount), 0n);
}

/** Cost per beneficiary × target beneficiaries, or null while either is missing. */
export function plannedBudgetPaisa(
  costPerBeneficiary: string | null,
  targetBeneficiaries: number | null,
): bigint | null {
  if (costPerBeneficiary === null || targetBeneficiaries === null) return null;
  return toPaisa(costPerBeneficiary) * BigInt(targetBeneficiaries);
}

/** numeric(14,2): a planned budget is below 10^14 paisa, or the column cannot hold it. */
export const BUDGET_LIMIT_PAISA = 10n ** 14n;
