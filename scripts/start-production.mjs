import { spawn } from 'node:child_process';

const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const children = [
  spawn(pnpm, ['run', 'start:web'], { stdio: 'inherit' }),
  spawn(pnpm, ['run', 'start:workers'], { stdio: 'inherit' }),
];

let stopping = false;
let desiredExitCode = 0;
let exitedChildren = 0;
function stop(signal = 'SIGTERM', exitCode = 0) {
  if (stopping) return;
  stopping = true;
  desiredExitCode = exitCode;
  for (const child of children) {
    if (!child.killed) child.kill(signal);
  }
  setTimeout(() => process.exit(desiredExitCode), 10_000);
}

for (const child of children) {
  child.once('error', (error) => {
    console.error('[Production] Échec du démarrage d’un processus', error);
    stop('SIGTERM', 1);
  });
  child.once('exit', (code, signal) => {
    exitedChildren += 1;
    if (!stopping) {
      console.error(
        `[Production] Processus arrêté (code=${code ?? 'null'}, signal=${signal ?? 'null'})`,
      );
      stop('SIGTERM', code === 0 ? 1 : (code ?? 1));
    }
    if (exitedChildren === children.length) process.exit(desiredExitCode);
  });
}

process.once('SIGINT', () => stop('SIGINT'));
process.once('SIGTERM', () => stop('SIGTERM'));
