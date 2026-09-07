# Architecture decision records

One file per decision: `NNNN-short-title.md`. One paragraph is enough.
Written while deciding, not afterwards.

## Template

```md
# NNNN - Title

Date: YYYY-MM-DD
Status: accepted

## Context

What forced a decision here.

## Decision

What was chosen.

## Rejected alternatives

What else was on the table and why it lost.

## Consequences

What this makes easy, what it makes expensive, what it locks in.
```

## Minimum set (CLAUDE.md, section 9)

- [ ] NestJS as the API framework
- [ ] TimescaleDB over plain Postgres
- [ ] Redis + BullMQ as the ingest queue
- [ ] SSE instead of WebSocket
- [ ] Next.js for the frontend
- [ ] Two timestamps: `device_ts` and `server_ts`
- [ ] Simulator before hardware
