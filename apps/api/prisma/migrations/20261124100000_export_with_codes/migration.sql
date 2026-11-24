-- A list export writes the code of a coded column (a state, a type, a gender) beside its words
-- only when the person asked for the codes; the words alone otherwise. Earlier jobs keep false:
-- their files are written already.
ALTER TABLE "export_jobs" ADD COLUMN "with_codes" BOOLEAN NOT NULL DEFAULT false;
