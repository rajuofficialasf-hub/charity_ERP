---
title: The project's application form chosen from the ready forms in the setup
type: feat
status: done
source: plan
date: 2026-11-19
---

# The project's application form chosen from the ready forms in the setup

## Goal

In a project's setup, the component "আবেদন ফর্ম" offers the published ready application forms in a dropdown; choosing one places it on the project as its application form, and while the project is a draft another choice replaces it. The form builder stays a small link.

## Problem

The owner, in chat on 2026-11-19: "আমি চাই আবেদন ফর্ম এর এখানে ফর্ম বিল্ডার খুলুন না থেকে আমার ফর্ম জেইগুলো পাবলিশ বা একদম রেডি করা আছে সেই গুলো ড্রাপডাউন এর মত দেখা যাবে সেখান থেকে আমি সিলেক্ট করব।" Today the row only links to the project's forms page, where a dialog places a ready form: one page and one dialog more than needed.

## Requirements

- **R1** The row of the component "আবেদন ফর্ম" in the setup's components step shows a dropdown "আবেদন ফর্ম" with the published ready forms of the kind "beneficiary application", each as "<title> (সংস্করণ <n>)".
- **R2** With no application form on the project, choosing a ready form places its published version on the project (the existing place, its key `default`), and the dropdown then shows it as chosen.
- **R3** With an application form already placed and the project a draft, choosing another asks to confirm ("আবেদন ফর্ম বদলাবেন?"), then places the new one and retires the old one's published version; the component names the new one, and a public link that opened the old form is switched off (it opens again only through its own route and checks). Nothing is deleted; the old copy stays with its versions, retired.
- **R4** Once the project is not a draft the dropdown is read-only and shows the placed form's name; the server refuses a replacement with 409 `form.replace_draft_only`.
- **R5** "ফর্ম বিল্ডার খুলুন" stays as a small link under the dropdown, to the project's forms page (own forms, a newer version of a placed form).
- **R6** A project form the PM built in the builder (no ready-form source) shows in the dropdown as the current choice by its own title.

## Key decisions

The owner's answers in chat on 2026-11-19 (D-186): a replacement only while the project is a draft; the builder link stays, small.

## Technical decisions

- **API**: `POST /projects/{projectId}/forms/place` takes an optional `replace: true`. With it the service, inside the same transaction, refuses a project that is not a draft (409 `form.replace_draft_only`), retires the published version of every other project form of the kind `beneficiary_application` (the one-way `published → retired` the database guard allows), removes them from the component's `form_ids`, re-points a public link's `form_ids` to the new form, and records the replaced ids in the `form.place` audit. A new copy takes a free key (the retired copy keeps `default`). Without `replace` the place is unchanged. Existing pattern: `ReadyFormsService.place` and the retire in `take-version` (`apps/api/src/services/ready-forms.ts`).
- **Web**: `ApplicationFormPicker` (`apps/web/src/admin/projects/setup/ApplicationFormPicker.tsx`) beside the switch, reusing `readyForms`, `placeForm` and `forms` of the forms API and the asf `SelectField` and `ConfirmDialog`; the setup's forms query refreshes after a place.
- Plan ids stay in the plan; code, comments and test names say the meaning in words.

## Implementation units

### U1. Replace an application form in a draft (API)
- **Files:** `packages/shared/src/forms/requests.ts` (+ test), `apps/api/src/services/ready-forms.ts`, `apps/api/test/integration/ready-forms.test.ts`, `packages/shared/src/i18n/messages/{bn,en}/errors.json`, `docs/api/openapi.yaml`, `docs/DECISION_LOG.md`.
- **Tests:** integration: a replace in a draft retires the old published version, the component names only the new form, a public link moves, the application form read returns the new form, the audit names the replaced form; a replace on an active project answers 409 `form.replace_draft_only` and changes nothing; a place without replace is unchanged; another program's PM is refused (403/404 as today).
- **Size:** M · **Risk area:** none (an existing permission) · **Status:** done

### U2. The dropdown in the setup (web)
- **Files:** `apps/web/src/admin/projects/setup/ApplicationFormPicker.tsx`, `ComponentsSection.tsx`, `setup.test.tsx`, `apps/web/src/admin/forms/forms-api.ts`, messages `{bn,en}/admin.json`.
- **Tests:** component: the dropdown lists only published beneficiary-application ready forms; a first choice places with the key `default`; a second choice in a draft asks to confirm and sends `replace`; an active project shows the name read-only; the builder link stays. E2E: `form-builder.spec.ts` or `projects.spec.ts` place through the dropdown where the journey placed through the forms page.
- **Size:** M · **Risk area:** none · **Status:** done

## Checkpoints
- **Mode:** all at once (one by one 0, grouped 4, all at once 9)
- **Signals:** N 2, L 300, R 0, Fd 0, C 2, P 0
- **C1** after U2: end

## Verification
`pnpm typecheck`, `pnpm lint`, the API test `ready-forms.test.ts`, the web tests of the setup, `pnpm docs:check`, the E2E specs touched.
