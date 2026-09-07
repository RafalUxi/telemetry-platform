import { Pool } from 'pg';

// Postgres access for the worker.
//
// A pool, not a single client: the worker runs several jobs at once and each one
// holds a connection for the duration of its INSERT. One shared client would
// serialise them - the exact bottleneck the queue exists to remove.

export const databaseUrl =
  process.env.DATABASE_URL ?? 'postgres://telemetry:local-dev-only@localhost:5432/telemetry';

// max must be at least the worker concurrency, or jobs queue up waiting for a
// connection instead of running.
export function createPool(max = 10): Pool {
  return new Pool({ connectionString: databaseUrl, max });
}
