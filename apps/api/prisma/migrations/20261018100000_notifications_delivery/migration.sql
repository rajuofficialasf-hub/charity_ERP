-- Notifications delivery (docs/DECISION_LOG.md, the notifications decision of 2026-10-18; plan
-- docs/plans/2026-10-18-0911-feat-notifications-plan.md). Additive: an in-app entry keeps the
-- template version it was written with, so an edited template never changes old entries; older
-- rows without it read the active version.
ALTER TABLE "notifications" ADD COLUMN "template_version" INTEGER;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_template_version_check" CHECK ("template_version" IS NULL OR "template_version" >= 1);
