/**
 * Money as whole paisa, so sums never carry floating-point error (the planned budget and the
 * fund-source total are compared to the paisa). Amounts arrive as decimal strings with up to two
 * decimals, as the API and the numeric(14,2) columns give them.
 */
// eslint-disable-next-line security/detect-unsafe-regex -- bounded repetitions without nesting: linear
const AMOUNT = /^(\d{1,12})(?:\.(\d{1,2}))?$/;

export function toPaisa(amount: string): number {
  const match = AMOUNT.exec(amount.trim());
  if (!match) throw new Error(`not an amount: ${amount}`);
  return Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
}

export function fromPaisa(paisa: number): string {
  return `${Math.trunc(paisa / 100)}.${String(paisa % 100).padStart(2, '0')}`;
}

export function sumPaisa(amounts: readonly string[]): number {
  return amounts.reduce((total, amount) => total + toPaisa(amount), 0);
}

/** Cost per beneficiary × target beneficiaries, or null while either is missing. */
export function plannedBudgetPaisa(
  costPerBeneficiary: string | null,
  targetBeneficiaries: number | null,
): number | null {
  if (costPerBeneficiary === null || targetBeneficiaries === null) return null;
  return toPaisa(costPerBeneficiary) * targetBeneficiaries;
}
