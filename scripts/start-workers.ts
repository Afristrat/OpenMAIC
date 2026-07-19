import { startAllWorkers, stopAllWorkers } from '../lib/jobs/workers';

startAllWorkers();

let stopping = false;
async function stop(signal: NodeJS.Signals) {
  if (stopping) return;
  stopping = true;
  console.info(`[Workers] Arrêt demandé par ${signal}`);
  await stopAllWorkers();
  process.exit(0);
}

process.once('SIGINT', () => void stop('SIGINT'));
process.once('SIGTERM', () => void stop('SIGTERM'));
