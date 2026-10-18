-- Reverses 20261018100000_notifications_delivery (docs/architecture/ADR/ADR-003-prisma-with-down-sql.md).
-- Entries then read the active template version.
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_template_version_check";
ALTER TABLE "notifications" DROP COLUMN "template_version";
