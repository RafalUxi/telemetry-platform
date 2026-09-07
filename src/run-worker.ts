import { createPool } from './db.js';
import { defaultWorkerConfig, startWorker, stopWorker } from './worker.js';

// Worker entry point.
//
// Separate process from the ingest on purpose: they fail for different reasons
// and recover at different speeds. Killing the worker must not stop messages
// being accepted.
//
// Run with:  npx tsx src/run-worker.ts

console.log('Worker is running');

const worker = startWorker(createPool(defaultWorkerConfig.concurrency), defaultWorkerConfig);
let processing: boolean = false;

const onSignal = () => {
  if (processing === true) {
    console.log(`Second event ignored - the closing is already in progress`);
    return;
  }
  processing = true;
  console.log('The closing started');
  stopWorker(worker)
    .then(() => {
      process.exitCode = 0;
      console.log(`The closing is done (worker)`);
    })
    .catch((err: Error) => {
      console.error('shutdown failed:', err.message);
      process.exitCode = 1;
    });
};

process.once('SIGINT', onSignal);
process.once('SIGTERM', onSignal);
