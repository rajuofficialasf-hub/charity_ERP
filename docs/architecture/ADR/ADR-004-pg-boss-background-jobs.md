# ADR-004: pg-boss for background jobs, consumed by a separate worker process

Status: approved 2026-10-10 (DECISION_LOG D-053, confirmed by the owner in O-01); the separate-worker-process choice is proposed in T0.8 and approved with `SYSTEM_ARCHITECTURE.md`. Written in task T0.8.

## Context

Background work is required for sync processing, notification delivery (email, SMS, in-app), monitoring alerts and document deadline warnings, priority score recomputation, exports, photo post-processing and the nightly storage-growth statistics (constitution §9). The constitution forbids message buses and distributed systems and asks for the simplest adequate architecture. Field-endpoint latency on distribution day is a hard requirement (NFR-01, NFR-04…07).

## Decision

- pg-boss as the job queue, using PostgreSQL tables in the same database. Jobs are enqueued inside the application service's transaction, so a job exists only if the business write committed.
- Named queues with their own retry and concurrency settings: `sync`, `notify`, `alerts`, `exports`, `photos`, `storage-stats`, `scores`. Scheduled jobs (nightly stats, deadline checks) use pg-boss's cron scheduling.
- Consumers run in a separate `worker` process started from the same `apps/api` image (`worker.ts`). The HTTP process only enqueues. Reason: long or bursty jobs (exports, photo hashing, Qurbani donor emails, alert computation) must not share the event loop with field requests; the worker can be restarted or scaled without touching the API; one image keeps deployment simple.
- `JOBS_INLINE=true` runs the consumers inside the API process for development and automated tests; the flag refuses to activate in production.
- Every job handler is idempotent (keyed by the entity id or `client_uuid`) because pg-boss guarantees at-least-once delivery; failures after the retry budget are visible on an admin screen and raise an in-app alert to the Monitoring Team.

## Alternatives considered

- BullMQ with Redis: higher throughput and richer features, but adds a Redis service to run, back up and monitor; the expected load (thousands of jobs per day, bursts of a few thousand on Qurbani day) does not need it.
- In-process timers and `setInterval`: no persistence; jobs lost on restart; no retries; rejected.
- In-process pg-boss consumers only: simpler process model but exposes field latency to heavy jobs; kept as the development mode only.

## Consequences

Positive: no additional infrastructure; transactional enqueue; jobs survive restarts; retries and scheduling built in; clean separation of request latency from batch work.

Negative: queue tables add load to the same PostgreSQL instance (acceptable at this scale; monitored through the metrics endpoint); two containers (api, worker) to deploy and watch; handlers must be written idempotently.

Follow-ups: T1.6 wires the `jobs` module and the worker entry point; T3.4 load-tests distribution day with the worker under load; T3.0 documents worker operations in the runbook.

## Related

D-053; NFR-01, NFR-04…07, NFR-10, NFR-30, NFR-52; `docs/architecture/SYSTEM_ARCHITECTURE.md` §2.1, §5; `docs/architecture/NOTIFICATIONS.md`.
