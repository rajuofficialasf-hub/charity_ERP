# NOTIFICATIONS

Status: outline, written in task T0.1 (2026-10-10); completed in task T0.14. Open items: Web Push (design brief §2 item 5), PWA short name (UX-09), SMS provider before Qurbani.

## 1. Channels
In-app (staff and volunteers), email via the organization's SMTP, SMS via a provider-agnostic adapter; none to beneficiaries (BR-214…216).

## 2. Event catalogue
Which domain events notify whom: registration approval and correction requests, assignment and consent, review and approval outcomes, field unlock requests, document soft warnings, monitoring alerts, Qurbani donor pre-notification and photo emails, OTP.

## 3. Templates and localization
Bilingual templates (BR-217), variables, digits (UX-05), sender identities.

## 4. Delivery and status
Outbox table, background job delivery, retries, delivery status per message (sent/failed), donor "sent" tracking (BR-147, BR-148).

## 5. Adapters
SMTP adapter (Mailpit in dev); SMS adapter interface, logging stub in dev, provider configuration in admin settings (BR-215); dummy OTP rule (BR-024).

## 6. In-app inbox
Volunteer "needs your attention" first (UX-12); read state; offline availability of the inbox.

## 7. Web Push (proposal)
Whether and how to add push for installed PWAs; iOS constraints; decision to be recorded.

## 8. Testing
Template rendering in both languages, adapter stubs, delivery retries, no messages to beneficiaries.
