-- Reverses 20261018100000_notifications_delivery (docs/architecture/ADR, the reversible migrations
-- record). Entries then read the active template version.
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_template_version_check";
ALTER TABLE "notifications" DROP COLUMN "template_version";
