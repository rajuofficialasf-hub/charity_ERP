# ENTITY-RELATIONSHIP DIAGRAM

Status: outline, written in task T0.1 (2026-10-10); completed in task T0.15 (Mermaid diagram in `erd.mermaid` plus this narrative). Entity inventory is already in `docs/MASTER_SPEC.md` B2. Depends on open questions 2, 3, 11, 14, 15, 18, 20.

## 1. Conventions
UUID primary keys, BEN-ID and application id formats, audit columns everywhere, soft delete only where approved, naming (snake_case, singular vs plural), bilingual columns.

## 2. Core cluster
programs, projects, project_settings, project_areas, project_components, project_templates, project_quotas, fund_sources.

## 3. People cluster
users, roles, permissions, user_permissions, device_sessions, handovers; volunteers, project_volunteers, volunteer_teams, ratings, rating_criteria, category_changes, blocklist, application_transfers.

## 4. Beneficiary cluster
beneficiaries (standard columns), beneficiary_earners, beneficiary_contact_changes, profile_correction_requests, profile_merges, media_consents, followup_evaluations.

## 5. Form cluster
forms, form_versions, form_sections, form_fields, field_options, section_library, field_library, public_form_links.

## 6. Application and workflow cluster
applications, application_answers, application_scores, workflow_templates, workflow_transitions, field_changes, site_verifications.

## 7. Activity and money cluster
project_activities, stock_movements, issues, payments, expense_claims, expense_items, vouchers, budget_ledger, nisab_versions.

## 8. Qurbani cluster
donors, animals, animal_shares, animal_photos, donor_messages.

## 9. Dawah cluster
syllabus_topics, daee_assignments, dawah_classes, class_attendance, learning_progress, exams, exam_results, call_logs.

## 10. Documents and media cluster
document_checklist_templates, documents, deficiency_reports, files, photo_metadata, media_stories.

## 11. Platform cluster
locations, notifications, notification_templates, outbound_messages, audit_log, settings, holiday_calendar, alerts, alert_settings, export_jobs.

## 12. Unique constraints and idempotency keys
NID, birth registration, volunteer mobile, (project, beneficiary), payment transaction id, client_uuid, (animal, assigned volunteer), BEN-ID pointers after merge.

## 13. Diagram
`erd.mermaid` (one diagram per cluster plus an overview), rendered in the documentation.
