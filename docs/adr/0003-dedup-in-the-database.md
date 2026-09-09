# 0003 - Deduplication in the database

Date: 2026-09-09

Status: accepted

## Context

The system sends data with QoS 1. That means if the broker acknowledges receipt and the acknowledgement is lost, the sender sends the data again.
at-least-once - when the worker writes the data and dies before acknowledging, the stalled mechanism hands the job on.
About 2% of measurements repeat. The repeats have to be read, but filtered out before they are written to the database.

## Decision

Use the database feature: ON CONFLICT DO NOTHING.
The filtering happens in the database, because that is the only place where the check and the write are one atomic operation.
There is no surrogate id - the natural key is used. An id would cost space and time in the database.
DO NOTHING - the first measurement written is the one that stays.
The database tells how many rows were actually written - rowCount.

## Rejected alternatives

1. SELECT before INSERT: reads the database to check whether the incoming data is already there. It costs extra load and time. TOCTOU - time-of-check to time-of-use. Two workers can run the SELECT at the same moment. Both reads say the data should be inserted, so both insert. This option is the right one when a constraint cannot be added, because you are writing to someone else's database.
2. A set in Redis - the set and the database are two separate systems. Whatever fails on the set side still reaches the database. The write can succeed while adding the key does not, which lets a duplicate through.

## Consequences

The key on 105 million rows weighs 4067 MB against a 7675 MB heap. The key weighs more than half of what the data does.
The natural key has to be part of the payload.
Duplicates are not treated as errors. Measured: 17 032 skips out of 843 213 samples in the one-hour run, all of them correct.
TimescaleDB forces the key to be extended:

```
ERROR:  cannot create a unique index without the column "device_ts" (used in partitioning)
```

Adding device_ts to the key means the database enforces identity only on the assumption that the device does not re-stamp device_ts on a repeat.
