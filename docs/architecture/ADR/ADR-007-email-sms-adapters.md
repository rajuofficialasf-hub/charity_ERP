# ADR-007: Provider-agnostic email and SMS adapters behind a transactional outbox

Status: approved with `docs/architecture/NOTIFICATIONS.md` (task T0.14, 2026-10-10); derives from Q-11, BD-47, D-053, D-054 and O-33.

## Context

Email must go through the organization's own SMTP server; SMS is needed only for OTP and Qurbani donor messages, and the SMS provider is not chosen yet (it will be set up before production, O-33). Development and test must run without sending anything real; the OTP must be a fixed dummy code there and impossible to enable in production (BD-49). Messages must never be lost when a provider is down and never be sent twice when a job is redelivered.

## Decision

- Two narrow interfaces in the `notifications` module: `EmailAdapter.send(message)` and `SmsAdapter.send(message)`, each returning a provider message id or a typed error (transient | permanent).
- Implementations: `SmtpEmailAdapter` (Nodemailer, organization's SMTP; Mailpit in dev), `HttpSmsAdapter` configured by admin settings (base URL, credentials, sender id, encoding, segment rules) so that any provider can be plugged in without code changes (Q-11), `LoggingSmsAdapter` for dev/test, and a dry-run mode for staging until a provider exists. `DummyOtpAdapter` sits in front of both for OTP only, behind `OTP_DUMMY_ENABLED`, refused in production.
- Every message is first written to `outbound_messages` in the same transaction as the business event; the worker delivers it with retries, bounded jitter and provider rate-limit handling; an idempotency key (event + recipient + channel) and a status check prevent duplicate sends.
- Provider credentials live in configuration/secrets (never in the database in clear text, never in logs); switching provider is a settings change plus a smoke test.

## Alternatives considered

- Calling providers directly from request handlers: simplest, but loses messages on provider outage, slows requests, and cannot guarantee once-only sending.
- Committing to one SMS provider's SDK now: blocks development until procurement and couples code to one vendor.
- A third-party notification platform: a cloud dependency (BD-45) and unnecessary for this volume.

## Consequences

Positive: development is unblocked without a provider; switching provider is configuration; delivery is reliable and auditable per message; the donor sent-status of BR-147/148 comes for free from the outbox.

Negative: one more table and worker queue to monitor; the HTTP SMS adapter must cover provider differences (auth styles, Unicode segmenting, delivery callbacks) through settings, and a provider with an unusual API may still need a small adapter subclass.

Follow-ups: T1.14 implements the adapters, outbox and inbox; the SMS provider is configured and smoke-tested before production (C3 item 10); T4.4 uses the donor messaging path.

## Related

Q-11, BD-34, BD-44, BD-47, BD-49, D-053, D-054, O-25, O-33; BR-024, BR-147, BR-148, BR-214…217; `docs/architecture/NOTIFICATIONS.md`, `docs/architecture/AUTH.md` §2.1.
