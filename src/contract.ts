import { array, number, string, z } from 'zod';

// Wire contract for one message sent by a device.
//
// Single source of truth: the simulator produces messages that satisfy this
// module, the ingest accepts only messages that satisfy this module. If the two
// sides could drift apart, this file would be doing its job badly.
//
// Message identity is the triple (device_id, boot_id, seq). It travels inside
// the message, so two deliveries of the same measurement carry the same key and
// the database can reject the second one.
//
// server_ts does not appear here. The server stamps it on arrival.

// One measurement taken by a device.
//
// Target shape for sampleSchema. While the schema and the type are two separate
// declarations, they can drift apart.
export interface Sample {
  seq: number; // Counter within one boot. Starts at 0, +1 per measurement. Resets on restart.
  device_ts: number; // Milliseconds since the Unix epoch. An integer, never a formatted string.
  temperature: number; // Degrees Celsius.
  humidity: number; // Relative humidity in percent.
}

// One MQTT message: an envelope identifying the device, carrying a batch of measurements.
// A device coming back after an outage sends its whole buffer in one message,
// not one message per measurement.
// Target shape for deviceMessageSchema, the same note about drifting apart.
export interface DeviceMessage {
  device_id: string; // Stable identity of the device.
  // Increments by one on every device boot, kept in non-volatile memory.
  // This is what stops a restarted device from colliding with its own
  // past: seq may return to 0, the triple stays unique.
  boot_id: number;
  samples: Sample[];
}

export const sampleSchema = z.object({
  seq: number().int().nonnegative(),
  device_ts: number().int().nonnegative(),
  temperature: number(),
  humidity: number(),
});

export const deviceMessageSchema = z.object({
  device_id: string().nonempty(),
  boot_id: number().int().nonnegative(),
  samples: array(sampleSchema).min(1),
});

// The decode function -> takes the payload from the broker. The type is defined by the data. Buffer.from(``). So the data type is Buffer or string.
// The function prepares the data for reading and converts the payload to a string.
// The key thing here is the use of the unknown return type -> it will not let you do anything with the data until its type is narrowed.

export function decode(payload: Buffer | string): unknown {
  try {
    return JSON.parse(payload.toString());
  } catch (err) {
    const head = payload.toString().slice(0, 30);
    throw new Error(`payload is not valid JSON (starts with: ${head})`, { cause: err });
  }
}

// The parseMessage function takes the output of decode (an unknown value) -> returns a typed value.
// Error handling works like this: .parse returns a ZodError -> then you format the array of strings into a string with .join.

// Example of err.issues;
//  [
//   {
//     expected: 'object',
//     code: 'invalid_type',
//     path: [],
//     message: 'Invalid input: expected object, received null'
//   }
// ]

export function parseMessage(value: unknown): DeviceMessage {
  try {
    return deviceMessageSchema.parse(value);
  } catch (err) {
    if (err instanceof z.ZodError) {
      throw new Error(err.issues.map((iss) => `${iss.path.join('.')} ${iss.message}`).join('; '), {
        cause: err,
      });
    } else {
      throw err;
    }
  }
}
