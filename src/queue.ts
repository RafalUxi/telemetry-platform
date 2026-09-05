import { Queue } from 'bullmq';
import type { Sample } from './contract.js';

// The queue between the ingest and the worker. The ingest adds work and forgets
// about it, the worker takes it out at its own pace. Work added here survives the
// death of the process that added it.

// Also the redis key prefix: every key lives under bull:<QUEUE_NAME>:*
export const QUEUE_NAME = 'telemetry-ingest';

export const connection = { url: process.env.REDIS_URL ?? 'redis://localhost:6379' };

// One job = one MQTT message that passed the contract.
// DeviceMessage plus server_ts, the one field a device cannot know.
export interface IngestJob {
  device_id: string;
  boot_id: number;
  server_ts: number; // Milliseconds since the Unix epoch, stamped by the ingest on arrival.
  samples: Sample[];
}

// Applied to every job added to this queue.
// Exponential backoff: 1s, 2s, 4s, 8s, 16s.
// removeOnFail: false keeps exhausted jobs in the 'failed' set - the dead letter queue.
export const jobOptions = {
  attempts: 5,
  backoff: { type: 'exponential' as const, delay: 1000 },
  removeOnComplete: 1000,
  removeOnFail: false,
};

// Built by the entry point, never on import: constructing a Queue opens a redis
// connection, and importing a module must not do that.
export function createIngestQueue(): Queue<IngestJob> {
  return new Queue<IngestJob>(QUEUE_NAME, { connection, defaultJobOptions: jobOptions });
}
