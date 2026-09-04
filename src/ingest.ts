import mqtt, { type MqttClient } from 'mqtt';
import type { Queue } from 'bullmq';
import type { IngestJob } from './queue.js';
import { decode, type DeviceMessage, parseMessage } from './contract.js';

// MQTT ingest.

// One subscription for the whole fleet, not one per device: the ingest is a
// server, the devices are the clients, and a wildcard topic filter is what makes
// adding the five hundredth device cost nothing here.

// Everything past it has a known shape;
// everything that fails to get that shape is counted and dropped, and never ends
// the process. It has no connection to postgres and must never grow one.

export interface IngestConfig {
  brokerUrl: string;
  topicFilter: string;
  // How often the counters and the queue depth are printed.
  statsIntervalMs: number;
}

export const defaultIngestConfig: IngestConfig = {
  brokerUrl: process.env.MQTT_URL ?? 'mqtt://localhost:1883',
  topicFilter: 'devices/+/telemetry',
  statsIntervalMs: 5000,
};

// Why a message was thrown away. Three separate reasons, because they are three
// different faults and they need three different reactions:
//   decode   - the bytes are not JSON. A broken encoder on the device.
//   schema   - it is JSON, but not a DeviceMessage. Contract drift.
//   identity - well formed, but the device_id inside does not match the topic it
//              arrived on. A device publishing under someone else's name.
export type RejectReason = 'decode' | 'schema' | 'identity';

export type IngestResult =
  { ok: true; job: IngestJob } | { ok: false; reason: RejectReason; detail: string };

export interface IngestStats {
  received: number;
  enqueued: number;
  rejected: Record<RejectReason, number>;
}

// Everything needed to stop the ingest cleanly.
export interface Ingest {
  client: MqttClient;
  queue: Queue<IngestJob>;
  stats: IngestStats;
  statsTimer: NodeJS.Timeout | null;
}

// funkcja przyjmuje temat -> rozdziela go na podstawie separatora `/` i zwraca deviceId

export function deviceIdFromTopic(topic: string): string | null {
  const parts = topic.split('/');
  if (parts.length > 3) return null;
  if (parts[0] !== 'devices') return null;
  if (parts[2] !== 'telemetry') return null;

  const deviceId = parts[1];
  if (deviceId === undefined || deviceId.length === 0) return null;

  return deviceId;
}

// Architecture - one try per one possible failure (decode, parseMessage).
// The topic is the trustworthy source of the deviceId.
// Returns an IngestJob carrying server_ts (Date.now()), but taken from a parameter
// rather than read inside the function.

export function toJob(topic: string, payload: Buffer, receivedAt: number): IngestResult {
  let value: unknown;
  try {
    value = decode(payload);
  } catch (err) {
    return { ok: false, reason: 'decode', detail: (err as Error).message };
  }

  let parse: DeviceMessage;
  try {
    parse = parseMessage(value);
  } catch (err) {
    return { ok: false, reason: 'schema', detail: (err as Error).message };
  }

  const deviceIdTopic = deviceIdFromTopic(topic);
  if (deviceIdTopic === null) {
    return { ok: false, reason: 'identity', detail: 'Can`t find deviceId from Topic' };
  }

  if (deviceIdTopic !== parse.device_id) {
    return {
      ok: false,
      reason: 'identity',
      detail: 'Device_id inside DeviceMessage does not match the topic',
    };
  }

  const job: IngestJob = {
    device_id: deviceIdTopic,
    boot_id: parse.boot_id,
    server_ts: receivedAt,
    samples: parse.samples,
  };

  return { ok: true, job: job };
}

// Anywhere async lands in a callback nobody awaits, there must be a .catch.
// When I use queue.add and async lands in a callback, there must be a catch.
// The function defines the stats, printed every config.statsIntervalMs.
// On the connect event it subscribes to config.topicFilter with qos 1.
// subscribe returns err and granted. qos 128 - the broker refused the subscription.

export function startIngest(queue: Queue<IngestJob>, config: IngestConfig): Ingest {
  const stats: IngestStats = {
    received: 0,
    enqueued: 0,
    rejected: { decode: 0, identity: 0, schema: 0 },
  };

  const client = mqtt.connect(config.brokerUrl, { clientId: `ingest` });

  client.on(`error`, (err) => console.error('Connection ingest error', err.message));

  client.on(`connect`, () => {
    client.subscribe(config.topicFilter, { qos: 1 }, (err, granted) => {
      if (err) return console.error('subscribe failed:', err.message);
      for (const g of granted ?? []) {
        if (g.qos === 128) console.error('Broker decline subscription:', g.topic);
      }
    });
  });

  client.on(`message`, (topic, payload) => {
    stats.received += 1;
    const jobResults = toJob(topic, payload, Date.now());
    if (jobResults.ok === true) {
      queue
        .add('IngestJob', jobResults.job)
        .then(() => (stats.enqueued += 1))
        .catch((err: Error) => console.error(`queue add failed`, err.message));
    }

    if (jobResults.ok === false) {
      const rejected = jobResults.reason;
      if (rejected === 'decode') stats.rejected.decode += 1;
      if (rejected === 'identity') stats.rejected.identity += 1;
      if (rejected === 'schema') stats.rejected.schema += 1;
    }
  });

  const statsTimer = setInterval(() => {
    queue
      .getJobCounts()
      .then((counts) => console.log(stats, counts))
      .catch((err: Error) => console.error(`can't reach counters`, err.message));
  }, config.statsIntervalMs);

  return { client: client, queue: queue, stats: stats, statsTimer: statsTimer };
}

// Start: connect -> subscribe -> start the interval.
// Stop: stop the interval -> stop receiving -> close the queue.
// Name: LIFO teardown.

export async function stopIngest(ingest: Ingest): Promise<void> {
  if (ingest.statsTimer !== null) {
    clearInterval(ingest.statsTimer);
    ingest.statsTimer = null;
  }

  await ingest.client.endAsync();
  await ingest.queue.close();

  console.log('To sum up (counters)', ingest.stats);
}
