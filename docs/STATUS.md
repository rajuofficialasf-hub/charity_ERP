# Project status (Claude updates this at the end of every task; read it at the start of every session)

- Last updated: 2026-10-10
- Current phase: 0 (Requirement & Architecture Freeze) - NOT STARTED
- Last completed task: none. The repository was bootstrapped on 2026-10-10 (docs, blueprint as Markdown, CLAUDE.md, slash commands) and holds no application code.
- Next task: T0.1 - Startup procedure (constitution section 16)
- Blocking items: none

## Open decisions waiting on the owner
- D-050..D-053 technical stack proposals (constitution section 9): confirm or change in task T0.7. Node.js 24 LTS is proposed (v24.15.0 is installed on the owner's machine).
- PWA short name for the phone home screen (open item of UX-09, proposal CSS) and whether to add Web Push (decide in task T0.14).
- Confirm with the web developer where the Bornomala font comes from (UX-13). The files declare the SIL Open Font License 1.0 and name Codepotro as vendor, but no public page confirms it.

## Prerequisites still open (checked 2026-10-10)
- pnpm is not installed on the owner's machine; needed from T1.1 (`npm install -g pnpm`).
- Docker Desktop was not running; needed from T1.1 (postgres, minio, mailpit via Docker Compose).
- The CI provider is to be named in T1.1.
- Other input files not yet supplied: see docs/source/README.md.

## Known issues / risks
- none yet

## Last test run
- none yet

## Notes for the next session
- The model and effort level for every task are in docs/MODEL_GUIDE.md. It is the owner's reference; Claude Code does not switch models by itself. The rows marked ছাড় নেই (no downgrade) must not be run on a lower model when a usage limit runs out.
- Brand assets are in docs/ui/brand/: colors.md, logo.png, logo.svg and fonts/ with licence texts (copied from the website on 2026-10-10).
- Design interview held on 2026-10-10: owner decisions UX-01 to UX-13 are in docs/ui/DESIGN_BRIEF.md. Import them into docs/DECISION_LOG.md in tasks T0.1 and T0.5. There is no Figma file; clickable HTML mockups are built in task T0.19b.
- Git remote: origin is https://github.com/rajuofficialasf-hub/charity_ERP.git, branch main.
- The repository contains only docs/, CLAUDE.md, .claude/, README.md and the git configuration files. No application code until Phase 0 is signed off.
- docs/source/ERP_BLUEPRINT_BN.md was machine-converted from the owner's docx and verified paragraph by paragraph against it on 2026-10-10.
