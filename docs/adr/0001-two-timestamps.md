# 0001 - Two timestamps (device_ts and server_ts)

Date: 2026-09-05

Status: accepted

## Context

The two timestamps diverge when the clock is broken and/or the device is sending a backlog after an outage. Keeping them apart is what lets us tell a late batch from a shifted clock.

## Decision

Storing both timestamps follows from the fact that after a power cut the microcontroller does not start from the current date. NTP has not synchronised yet after boot while the device is already measuring. On top of that, randomised clock-cycle values simulate quartz drift.
server_ts is the time the server received the data. It is a separate column in the database.
server_ts is set by the ingest, on receipt.

## Rejected alternatives

device_ts alone - no information about when the data arrived.
server_ts alone - no information about when the measurement was taken.

## Consequences

Swapping the simulator for real hardware costs two days, not a week.
Clock skew and backlog delivery are indistinguishable from the timestamps of a single sample alone.
The database gets two columns. The difference server_ts - device_ts becomes a useful signal.
Every query has to decide which time axis it is asking about.
