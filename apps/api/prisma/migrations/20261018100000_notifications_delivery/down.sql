-- Reverses 20261018100000_notifications_delivery (docs/architecture/ADR, the reversible migrations
-- record). Entries then read the active template version.
DROP INDEX IF EXISTS "outbound_messages_recipient_user_id_coalesce_key_idx";
ALTER TABLE "outbound_messages" DROP COLUMN "coalesce_key";
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_template_version_check";
ALTER TABLE "notifications" DROP COLUMN "template_version";
