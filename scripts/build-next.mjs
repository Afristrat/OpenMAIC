import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
// Scope the heap allowance to compilation and its child workers. Runtime web
// and BullMQ limits remain independent. Preserve other inherited Node options.
const result = spawnSync(process.execPath, [require.resolve('next/dist/bin/next'), 'build', '--webpack'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --max-old-space-size=4096`.trim(),
  },
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
