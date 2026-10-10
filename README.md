# CSS ERP — As-Sunnah Foundation, Charity & Social Service Department

ERP for the Charity & Social Service Department of As-Sunnah Foundation: volunteers, beneficiaries, applications, distribution and construction projects, dawah, budgets, SOP documents and monitoring, with an offline-first mobile PWA for field volunteers. It is built with Claude Code under a written project constitution.

Repository: https://github.com/rajuofficialasf-hub/charity_ERP

## Where things are

| Path | What it is |
|---|---|
| `CLAUDE.md` | Instructions Claude Code loads in every session; it imports the constitution |
| `docs/MASTER_PROMPT.md` | The project constitution: rules, 49 approved decisions, roadmap, standards |
| `docs/source/ERP_BLUEPRINT_BN.md` | The business blueprint in Bengali, the top business authority. Diagrams are in `docs/source/images/` |
| `docs/PLAN.md` | The owner's step-by-step plan: 78 task prompts for Phase 0-6 (Bengali guidance, English prompts) |
| `docs/ui/DESIGN_BRIEF.md` | The owner's design decisions from the 2026-10-10 interview: look, devices, digits, photos, notifications |
| `docs/STATUS.md` | Session hand-off: current phase, next task, open decisions, known issues |
| `docs/source/README.md` | Input files the owner still has to supply (mockups, SOP, samples, location data) |
| `.claude/commands/` | Project slash commands: `/css-start`, `/css-end`, `/css-fix`, `/css-change`, `/css-bug`, `/css-review`, `/css-docsync`, `/css-status`, `/css-gate`, `/css-uat` |

## Working with Claude Code

1. Open this folder in Claude Code (terminal: `claude`, or the Claude desktop app, Code tab).
2. Run `/css-start`. Claude reports where the project stands and waits.
3. Switch to plan mode (Shift+Tab), paste the next task prompt from `docs/PLAN.md` section 4, review the plan, approve.
4. When the task is done, run `/css-end`: tests, `docs/STATUS.md`, commit, report.

বাংলায় সংক্ষেপে: ফোল্ডারে `claude` চালান, `/css-start` দিন, plan mode চালু করে `docs/PLAN.md` থেকে পরের টাস্কের প্রম্পট পেস্ট করুন, কাজ শেষে `/css-end` দিন।

## Application setup

Added by task T1.1 once the repository is scaffolded. Until then there is no application code: Phase 0 produces documents only.
