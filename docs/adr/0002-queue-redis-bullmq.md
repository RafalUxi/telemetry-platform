# 0002 - Redis + BullMQ queue instead of writing straight from MQTT

Date: 2026-09-05

Status: accepted

## Context

Writing straight from MQTT into the database opens a gap between the rate of samples coming in and the rate going out.

## Decision

The queue sits between the ingest and the worker.
The queue holds the measurements and lets them be recovered when the ingest or the worker dies. Redis is a separate process.
The stored data stays fully readable. Jobs can be inspected without stopping the system.

## Rejected alternatives

1. Writing straight into the database:

- ~1590 msg/s in
- ~495 rows/s out

So the backlog grows by ~1100/s.
One corrupt payload killed the process in under a second - it never printed its first line of statistics.
A kill -9 wiped 84,317 measurements for good, because the broker had already sent PUBACK and nobody will resend them.

2. An array in the process memory - opens the door to data loss, no retries, no DLQ, and no queue depth as a number.
3. Kafka - overkill at this scale.

## Consequences

Redis has to be up for the write path to be complete.
The write is asynchronous relative to receipt -> server_ts has to be stamped in the ingest.
"at-least-once" means duplicates are normal, not a fault -> the unique key stops being optional.
Queue statistics become a visible metric.
More processes to run and maintain.
Durability against a crash of Redis itself is bounded by the last RDB snapshot.
The queue does not create throughput - when more comes in than goes out, it only buys time and the ability to watch the queue statistics.
