import { Worker } from 'bullmq';
import { Result, type Pool } from 'pg';
import { connection, QUEUE_NAME, type IngestJob } from './queue.js';

// The worker: takes jobs off the queue and writes them to postgres.
//
// It is the other half of the gap the queue opened. The ingest reads the socket
// at the speed of the devices; the worker writes at the speed of the database,
// and neither waits for the other. It has no MQTT connection and must never
// grow one.
//
// A job is acknowledged by the processor returning. Everything that must survive
// a crash has to have happened before that.

export interface WorkerConfig {
  // How many jobs run at once. Must not exceed the pool size.
  concurrency: number;
  // How often the counters are printed.
  statsIntervalMs: number;
}

export const defaultWorkerConfig: WorkerConfig = {
  concurrency: 5,
  statsIntervalMs: 5000,
};

// What one write actually did.
// inserted + skipped always equals the number of samples in the job: a sample
// either became a row or lost to the unique constraint.
export interface WriteResult {
  inserted: number;
  skipped: number;
}

export interface WorkerStats {
  jobs: number;
  inserted: number;
  skipped: number;
  failed: number;
}

// Everything needed to stop the worker cleanly.
export interface Ingester {
  worker: Worker<IngestJob>;
  pool: Pool;
  stats: WorkerStats;
  statsTimer: NodeJS.Timeout | null;
}

// VALUES (...),(...),(...) -> groups the data into rows on write. The grouping
// lives only in the SQL text.
// values is flat and knows nothing about it: $1 is values[0].
// The function writes into the seven columns of the table.
// Returns how many rows were written and how many were rejected.
// One multi-row insert, one round-trip.

export async function writeSamples(pool: Pool, job: IngestJob): Promise<WriteResult> {
  const values: unknown[] = [];
  const tuples = job.samples.map((d) => {
    const n = values.length;
    values.push(
      job.device_id,
      job.boot_id,
      d.seq,
      d.device_ts,
      job.server_ts,
      d.temperature,
      d.humidity,
    );
    return `($${n + 1}, $${n + 2}, $${n + 3}, to_timestamp($${n + 4} / 1000.0), to_timestamp($${n + 5} / 1000.0), $${n + 6}, $${n + 7})`;
  });

  try {
    const results = await pool.query(
      `INSERT INTO measurements (device_id, boot_id, seq, device_ts, server_ts, temperature, humidity) VALUES ${tuples.join(`,`)} ON CONFLICT DO NOTHING`,
      values,
    );
    const inserted = results.rowCount;
    if (inserted === null) throw new Error(`Number of inserted is equal null `);

    const skipped = job.samples.length - inserted;

    const output: WriteResult = { inserted: inserted, skipped: skipped };
    return output;
  } catch (err) {
    throw new Error(
      `DeviceId: ${job.device_id}; boot_id: ${job.boot_id}; Number of samples that failed: ${job.samples.length}`,
      { cause: err },
    );
  }
}

// Builds the worker; the processor is where the samples get written.
// autorun: false -> lets the intervals start before the worker begins taking jobs.
// Rule: everything the processor touches must exist before new Worker.
// concurrency <= pool size (max 10).

export function startWorker(pool: Pool, config: WorkerConfig): Ingester {
  const stats: WorkerStats = { jobs: 0, inserted: 0, skipped: 0, failed: 0 };

  const worker = new Worker<IngestJob, WriteResult>(
    QUEUE_NAME,
    async (job) => {
      const results = await writeSamples(pool, job.data);
      return results;
    },
    { connection, concurrency: config.concurrency, autorun: false },
  );

  const statsTimer = setInterval(() => {
    console.log(stats);
  }, config.statsIntervalMs);

  void worker.run();

  worker.on(`error`, (err: Error) => {
    console.error(err.message);
  });

  worker.on('failed', (job, err) => {
    stats.failed += 1;
    console.error(`Task: ${job?.id}; probe: ${job?.attemptsMade}:`, err.message);
  });

  worker.on('completed', (job, result) => {
    stats.jobs += 1;
    stats.inserted += result.inserted;
    stats.skipped += result.skipped;
  });

  const output: Ingester = { worker: worker, pool: pool, stats: stats, statsTimer: statsTimer };

  return output;
}

// Stop: stop the interval -> close the worker and wait -> close the connections and wait.

export async function stopWorker(ingester: Ingester): Promise<void> {
  if (ingester.statsTimer !== null) {
    clearInterval(ingester.statsTimer);
    ingester.statsTimer = null;
  }

  await ingester.worker.close();
  await ingester.pool.end();

  console.log('To sum up (counters)', ingester.stats);
}
