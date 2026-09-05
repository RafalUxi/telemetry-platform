import { createIngestQueue } from './queue.js';
import { defaultIngestConfig, startIngest, stopIngest } from './ingest.js';

// Ingest entry point.
//
// A separate file for the same reason run-simulator.ts is one: ingest.ts is a
// library, and importing it must not open a broker connection.
//
// Run with:  npx tsx src/run-ingest.ts

console.log('Ingest is running');

const ingest = startIngest(createIngestQueue(), defaultIngestConfig);
let processing: boolean = false;

const onSignal = () => {
  if (processing === true) {
    console.log(`Second event ignored - the closing is already in progress`);
    return;
  }
  processing = true;
  console.log('The closing started');
  stopIngest(ingest)
    .then(() => {
      process.exitCode = 0;
      console.log(`The closing is done (ingest)`);
    })
    .catch((err: Error) => {
      console.error('shutdown failed:', err.message);
      process.exitCode = 1;
    });
};

process.once('SIGINT', onSignal);
process.once('SIGTERM', onSignal);
