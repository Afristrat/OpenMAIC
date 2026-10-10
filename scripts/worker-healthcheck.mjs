import { readdirSync, readFileSync } from 'node:fs';

const workerIsRunning = readdirSync('/proc', { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && /^\d+$/.test(entry.name))
  .some((entry) => {
    try {
      const command = readFileSync(`/proc/${entry.name}/cmdline`, 'utf8').replaceAll('\0', ' ');
      return command.includes('scripts/start-workers.ts');
    } catch {
      return false;
    }
  });

process.exit(workerIsRunning ? 0 : 1);
