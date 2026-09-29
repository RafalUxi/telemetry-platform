import { createPool } from './db.js';
import { defaultWorkerConfig, startWorker, stopWorker } from './worker.js';
import { logger } from './logger.js';
const log = logger.child({ name: 'worker' });

// Worker entry point.
//
// Separate process from the ingest on purpose: they fail for different reasons
// and recover at different speeds. Killing the worker must not stop messages
// being accepted.
//
// Run with:  npx tsx src/run-worker.ts

log.info('Worker is running');

const worker = startWorker(createPool(defaultWorkerConfig.concurrency), defaultWorkerConfig);
let processing: boolean = false;

const onSignal = () => {
  if (processing === true) {
    log.warn(`Second event ignored - the closing is already in progress`);
    return;
  }
  processing = true;
  log.info('The closing started');
  stopWorker(worker)
    .then(() => {
      process.exitCode = 0;
      log.info(`The closing is done (worker)`);
    })
    .catch((err: Error) => {
      log.error({ err }, 'shutdown failed');
      process.exitCode = 1;
    });
};

process.once('SIGINT', onSignal);
process.once('SIGTERM', onSignal);
