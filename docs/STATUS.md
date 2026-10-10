# Project status (Claude updates this at the end of every task; read it at the start of every session)

- Last updated: 2026-10-10
- Current phase: 0 (Requirement & Architecture Freeze) - NOT STARTED
- Last completed task: none. The repository was bootstrapped on 2026-10-10 (docs, blueprint as Markdown, CLAUDE.md, slash commands) and holds no application code.
- Next task: T0.1 - Startup procedure (constitution section 16)
- Blocking items: none

## Open decisions waiting on the owner
- D-050..D-053 technical stack proposals (constitution section 9): confirm or change in task T0.7. Node.js 24 LTS is proposed (v24.15.0 is installed on the owner's machine).

## Prerequisites still open (checked 2026-10-10)
- pnpm is not installed on the owner's machine; needed from T1.1 (`npm install -g pnpm`).
- Docker Desktop was not running; needed from T1.1 (postgres, minio, mailpit via Docker Compose).
- No Git remote yet (plan section 3, M3); the CI provider is to be named in T1.1.
- Input files not yet supplied: see docs/source/README.md.

## Known issues / risks
- none yet

## Last test run
- none yet

## Notes for the next session
- The repository contains only docs/, CLAUDE.md, .claude/, README.md and the git configuration files. No application code until Phase 0 is signed off.
- docs/source/ERP_BLUEPRINT_BN.md was machine-converted from the owner's docx and verified paragraph by paragraph against it on 2026-10-10.
