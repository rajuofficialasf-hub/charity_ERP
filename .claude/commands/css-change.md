---
description: "New owner decision: impact analysis first, then log it and implement after approval"
argument-hint: "[the decision]"
disable-model-invocation: true
---
New decision from the project owner: $ARGUMENTS
Per the No Silent Change policy: first report what it conflicts with (blueprint sections, BD/BR ids, DECISION_LOG entries), the affected modules, and the database / API / UI / security / testing / migration impact. Then wait for my approval. After approval: record it in docs/DECISION_LOG.md with a new id and today's date, update the affected documents, then implement with tests.
