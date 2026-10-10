# Workflow templates

Status: folder created in task T0.1 (2026-10-10); the machine-readable definitions are written in task T0.11 and seeded into the engine in task T2.5. Format and guard names are defined in `docs/architecture/WORKFLOW_ENGINE.md`.

One file per project type (blueprint A8, B5):

| File | Template | Projects | Stages after approval (blueprint example) |
|---|---|---|---|
| `distribution.yaml` | Distribution | Winter clothing, iftar, meat distribution, Qurbani beneficiary side | Package Sent → Received → Distributed → Completed |
| `construction.yaml` | Construction | Semi-pucca and tin houses | Worker Assigned → stages written by the PM (e.g. Foundation, Wall, Roof) → Completed |
| `advance-voucher.yaml` | Advance + construction + voucher | Safe water | Fund Sent → Work Started → Work Completed → Voucher → Verified → Completed |
| `implementation-evidence.yaml` | Implementation + evidence + follow-up | Self-reliance | Purchase → Evidence → Verified → Completed → Follow-up (exam gate before payment) |
| `qurbani.yaml` | Beneficiary + donor + animal | Qurbani | Distribution template plus donor flow Imported → Animal Allocated → Notified → Photos Sent → Voucher |
| `open-application-visit.yaml` | Open application + visit | Tree planting | Verified → Visit → Distributed → Completed |

All six share the common cycle Draft → Submitted → Under Review → Reviewed → Approved / Rejected → … → Completed → Closed (BD-11). House construction overrides the approver to the PM (BD-24).
