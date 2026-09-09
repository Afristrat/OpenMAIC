import { startAllWorkers, stopAllWorkers } from '../lib/jobs/workers';
import { startLtiGradeWorker } from '../lib/lti/worker';
import { startLearningRetentionWorker } from '../lib/telemetry/learning-retention-worker';

startAllWorkers();
const stopLtiGrades = startLtiGradeWorker();
const stopLearningRetention = startLearningRetentionWorker();

let stopping = false;
async function stop(signal: NodeJS.Signals) {
  if (stopping) return;
  stopping = true;
  console.info(`[Workers] Arrêt demandé par ${signal}`);
  await Promise.all([stopAllWorkers(), stopLtiGrades(), stopLearningRetention()]);
  process.exit(0);
}

process.once('SIGINT', () => void stop('SIGINT'));
process.once('SIGTERM', () => void stop('SIGTERM'));
