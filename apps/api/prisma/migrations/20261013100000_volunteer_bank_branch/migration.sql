-- The branch of the volunteer's bank (DECISION_LOG D-091, O-64; plan
-- docs/plans/2026-10-13-1130-feat-registration-simplify-plan.md, U3): added later from the own
-- profile with the other bank details, protected by the same field class volunteer.bank.

-- AlterTable
ALTER TABLE "volunteers" ADD COLUMN "bank_branch_name" TEXT;
