-- Reverts 20261013100000_volunteer_bank_branch: the branch names entered since are dropped.
ALTER TABLE "volunteers" DROP COLUMN "bank_branch_name";
