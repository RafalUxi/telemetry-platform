# 0004 - Chunk time interval

Date: 2026-09-09

Status: accepted

## Context

The system has to collect measurements over a year in a workable way, which is why the table is a hypertable.
A hypertable splits the table into chunks. The number of chunks follows from the chunk time interval, which has to be defined.

## Decision

The chosen interval is 7 days, which means 52 chunks for a year of data. 52 chunks take about 160 locks when the data is read. Scaling the project to a few years of data, this decision is meant to keep the number of locks from exhausting the available budget of 12 800. On top of that, 7 days is what the vendor sets as the default.

## Rejected alternatives

1. 1 hour - 8760 chunks, which comes to about 26 000 locks:

```
ERROR:  out of shared memory
```

2. 1 day - 365 chunks, which comes to about 1 100 locks.

## Consequences

Retention and compression work on whole chunks - the resolution is a week.
Operations on the whole table take ~160 locks instead of ~1 100.
