import { createIngestQueue } from './queue.js';
import { defaultIngestConfig, startIngest, stopIngest } from './ingest.js';
import { logger } from './logger.js';
const log = logger.child({ name: 'ingest' });

// Ingest entry point.
//
// A separate file for the same reason run-simulator.ts is one: ingest.ts is a
// library, and importing it must not open a broker connection.
//
// Run with:  npx tsx src/run-ingest.ts

log.info('Ingest is running');

const ingest = startIngest(createIngestQueue(), defaultIngestConfig);
let processing: boolean = false;

const onSignal = () => {
  if (processing === true) {
    log.warn(`Second event ignored - the closing is already in progress`);
    return;
  }
  processing = true;
  log.info('The closing started');
  stopIngest(ingest)
    .then(() => {
      process.exitCode = 0;
      log.info(`The closing is done (ingest)`);
    })
    .catch((err: Error) => {
      log.error({ err }, 'shutdown failed');
      process.exitCode = 1;
    });
};

process.once('SIGINT', onSignal);
process.once('SIGTERM', onSignal);
