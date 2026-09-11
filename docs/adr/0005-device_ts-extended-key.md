# 0005 - device_ts extended key

Date: 2026-09-11

Status: accepted

## Context

TimescaleDB requires every unique index to contain the partitioning column.
Every chunk has its own local index. The same key value always lands in the same chunk, and that is what turns local uniqueness into global uniqueness.
The partitioning column does not have to come first.

```
ERROR:  cannot create a unique index without the column "device_ts" (used in partitioning)
HINT:   If you're creating a hypertable on a table with a primary key, ensure the
        partitioning column is part of the primary or composite key.
```

## Decision

device_ts is added in second position of the key: (device_id, device_ts, boot_id, seq).
It sits second because of the leftmost prefix rule.
A search using a time range then goes from 0.458 ms down to 0.148 ms.

## Rejected alternatives

1. device_ts at the end of the key - the column cannot be used to narrow the search. The database reads every row of the device and throws them away with a filter.
2. (device_id, device_ts) - a key without boot_id and seq. When a device restarts, a new clock offset is drawn in the range of +/- 5 minutes. That can produce samples carrying the same key but different values, which leads to correct measurements being deleted.
3. Dropping the unique key - deduplication is lost.

## Consequences

The key needs more space.
A measurement whose key differs only in device_ts passes the database constraint and lands in a different place.
A device may re-stamp device_ts, which lets it through the deduplication constraint.
