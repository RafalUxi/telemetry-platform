import { defaultConfig, startFleet, stopFleet, type Device } from './simulator.js';

// Simulator entry point.

// A separate file, because simulator.ts is a library: the ingest will import
// topicFor and the types from it, and the import alone must not start two hundred devices.

// Run with:  npx tsx src/run-simulator.ts

// Stops the fleet and brings the process to an end.

console.log('simulator is running');

const fleet = startFleet(defaultConfig);
let processing: boolean = false;

async function shutdown(devices: Device[]): Promise<void> {
  if (processing === true) {
    console.log(`Second event ignored - the closing is already in progress`);
    return;
  }
  processing = true; // Set the flag before the first suspension point
  console.log('The closing started');
  await stopFleet(devices);
}

process.on('SIGINT', async () => {
  await shutdown(fleet);
  console.log(`The closing is done`);
  process.exit(0);
});
