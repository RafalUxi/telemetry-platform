import mqtt, { type MqttClient } from 'mqtt';
import type { Sample } from './contract.js';

// Device fleet simulator.

// Pretends to be N physical devices publishing to the same broker and in the same
// format as the real hardware.

// Every device has its own MQTT connection, because in MQTT the connection is the
// unit of identity: its own clientId and its own LWT.

// The simulator MUST be able to break. A well-behaved simulator publishing evenly
// once a second will only test the path that never fails anyway.

// Calibration knobs. All faults are probabilities checked once per tick, in the
// range 0..1. Zero disables a given fault.
export interface SimulatorConfig {
  brokerUrl: string;
  deviceCount: number;
  // Interval between measurements of a single device.
  sampleIntervalMs: number;
  // How many measurements at most go into one message when sending the backlog.
  batchMaxSize: number;
  // How many measurements the device keeps in the buffer before it starts dropping.
  bufferMaxSize: number;
  // Maximum clock offset of the device, drawn once per boot, in both directions.
  clockDriftMaxMs: number;
  // Maximum time until the device restarts after the connection drops
  constReconnectPeriod: number;
  faults: {
    // The device loses its connection and starts buffering.
    disconnect: number;
    // The same message goes out twice - this is what QoS 1 does on a broken network.
    duplicate: number;
    // The payload goes out corrupted and cannot be parsed.
    corruptPayload: number;
  };
}

export const defaultConfig: SimulatorConfig = {
  brokerUrl: process.env.MQTT_URL ?? 'mqtt://localhost:1883',
  deviceCount: 200,
  sampleIntervalMs: 1000,
  batchMaxSize: 50,
  bufferMaxSize: 500,
  clockDriftMaxMs: 5 * 60 * 1000,
  constReconnectPeriod: 300 * 1000,
  faults: {
    disconnect: 0.001,
    duplicate: 0.02,
    corruptPayload: 0.005,
  },
};

// State of one simulated device. Everything a real board would keep in RAM and in
// non-volatile memory.
export interface Device {
  // Goes into the payload. This is the identifier from the contract.
  deviceId: string;
  // Increments on every device start. The equivalent of non-volatile memory.
  bootId: number;
  // Counter of measurements within this boot. Resets together with bootId incrementing.
  seq: number;
  // By this much the clock of this device diverges from real time. May be negative.
  clockOffsetMs: number;
  // Measurements taken but not sent yet. Grows when there is no connection.
  buffer: Sample[];
  // Null until the device establishes a connection.
  client: MqttClient | null;
  // Handle of the measurement loop, needed to stop the device.
  timer: NodeJS.Timeout | null;
}

// The topic one device publishes to.
// Every device exactly to its own topic.
export function topicFor(deviceId: string): string {
  return 'devices/' + deviceId + '/telemetry';
}

// Builds one device in its starting state, still without a connection.

export function createDevice(index: number, config: SimulatorConfig): Device {
  const deviceId = `dev-${index}`;
  const bootId = 0;
  const seq = -1; // Special setting so that counting the samples starts at 0
  const clockDriftMs =
    Math.random() > 0.5
      ? Math.floor(Math.random() * config.clockDriftMaxMs)
      : Math.floor(Math.random() * -1 * config.clockDriftMaxMs);

  const newDevice: Device = {
    deviceId: deviceId,
    bootId: bootId,
    seq: seq,
    clockOffsetMs: clockDriftMs,
    buffer: [],
    client: null,
    timer: null,
  };

  return newDevice;
}

// Takes one measurement and bumps the counter of the device.

export function nextSample(device: Device): Sample {
  const newSample: Sample = {
    seq: (device.seq += 1),
    device_ts: Date.now() + device.clockOffsetMs,
    temperature: 18 + Math.random() * 6, // Range 18-24 degrees
    humidity: 40 + Math.random() * 30, // Range 40-70%
  };

  return newSample;
}

// Sends a batch of measurements as one MQTT message.
// Handles two faults: 1) a corrupted message; 2) a duplicated message

export function publishBatch(device: Device, samples: Sample[], config: SimulatorConfig): void {
  if (device.client === null || !device.client.connected) return;

  const deviceId = device.deviceId;
  const client = device.client;
  const deviceMsg: string =
    Math.random() <= config.faults.corruptPayload
      ? ' \n'
      : JSON.stringify({
          device_id: deviceId,
          boot_id: device.bootId,
          samples: samples,
        });

  if (Math.random() <= config.faults.duplicate) {
    client.publish(topicFor(deviceId), deviceMsg, { qos: 1 });
  }

  client.publish(topicFor(deviceId), deviceMsg, { qos: 1 });
}

// One turn of the device loop: measure, decide, send or put aside.
// The decision taken is to drop the newest measurements.
// Old measurements are frozen in the buffer.
// A device outage lasts constReconnectPeriod, and the state is detected through .connected => boolean

export function tick(device: Device, config: SimulatorConfig): void {
  device.buffer.push(nextSample(device));
  device.buffer = device.buffer.slice(0, config.bufferMaxSize); // Dropping new measurements

  if (device.client === null || !device.client.connected) return;
  if (Math.random() <= config.faults.disconnect) {
    device.client.stream.destroy();
    return;
  }

  publishBatch(device, device.buffer.slice(0, config.batchMaxSize), config);
  device.buffer = device.buffer.slice(config.batchMaxSize);
}

// Connects one device to the broker and starts its measurement loop.

export function startDevice(device: Device, config: SimulatorConfig): void {
  device.client = mqtt.connect(config.brokerUrl, {
    clientId: device.deviceId,
    will: { topic: 'error/' + 'devices/' + device.deviceId, payload: 'offline', qos: 1 },
    reconnectPeriod: config.constReconnectPeriod,
  });

  device.timer = setInterval(() => {
    tick(device, config);
  }, config.sampleIntervalMs);
}

// Builds and starts the whole fleet.
// First it builds the array of devices
// Then every 50 ms it starts the next devices

let startFleetTimer: NodeJS.Timeout; // Global variable - needed to overwrite the interval handle (possible shutdown in stopFleet)

export function startFleet(config: SimulatorConfig): Device[] {
  const dev: Device[] = [];
  for (let i = 0; i < config.deviceCount; i++) {
    dev.push(createDevice(i, config));
  }

  let devCounter = 0;
  startFleetTimer = setInterval(() => {
    const index = devCounter++;

    if (dev[index]) {
      startDevice(dev[index], config);
    }

    if (devCounter === config.deviceCount) clearInterval(startFleetTimer);
  }, 50);

  return dev;
}

// Function returning a promise of closing the device client

function closeDevice(device: Device) {
  const client = device.client;
  if (client === null) {
    console.log(`Device id: ${device.deviceId} - closeDevice error`);
    return;
  }
  return new Promise((resolve) => {
    client.end(resolve);
  });
}

// Stops the fleet and closes the connections.
// Promise.allSettled was used - it makes the promise not throw an error.
// It returns PromiseRejectedResults containing status and value / reason

export async function stopFleet(devices: Device[]): Promise<void> {
  clearInterval(startFleetTimer);

  for (const dev of devices) {
    if (dev.timer === null) {
      console.log(`Device id: ${dev.deviceId} - stop timer error`);
      continue;
    }
    clearInterval(dev.timer);
    dev.timer = null;
  }

  const promise = await Promise.allSettled(devices.map((p) => closeDevice(p)));
  const down = promise.filter((w) => w.status === 'rejected');
  if (down.length > 0) {
    console.log(`${down.length} not closed: ${down.map((w) => w.reason.message).join(', ')}`);
  }
}
