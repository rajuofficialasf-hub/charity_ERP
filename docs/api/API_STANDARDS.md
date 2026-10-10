# API STANDARDS

Status: outline, written in task T0.1 (2026-10-10); completed in task T0.17. Depends on D-051 (NestJS + OpenAPI generation).

## 1. Base conventions
Versioned base path `/api/v1`, JSON, UTF-8, timestamps in ISO 8601 UTC, money as decimal strings, English digits.

## 2. Response envelope
Success and error envelopes, pagination metadata, request id.

## 3. Pagination, filtering, sorting, searching
Query parameter conventions, default and maximum page sizes (NFR-11), filter grammar for tabs (location, status, type, category), full-text search rules.

## 4. Validation and errors
Error codes catalogue, field-level validation errors, localized messages via i18n keys, no stack traces or SQL.

## 5. Authentication and authorization headers
Bearer tokens, device session header, how every endpoint declares its permission name and scope (BR-193).

## 6. Idempotency
Idempotency keys for sync batches and payments; `client_uuid` semantics; retry behaviour.

## 7. Rate limiting
Limits for auth, OTP and public forms (NFR-41); headers returned.

## 8. Files
Upload initiation, chunked upload, signed download URLs.

## 9. Audit and sensitive data
Which endpoints write audit entries; field-level masking rules in serializers (BR-183).

## 10. Documentation and contract tests
OpenAPI generation, drift test against `docs/api/openapi.yaml` (NFR-54), breaking-change process (impact analysis, approval, migration, tests).

## 11. Localization
Accept-Language handling, bilingual data fields in responses.
