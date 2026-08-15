import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

describe('Qalem build memory configuration', () => {
  it('gives the validation build ten GiB', () => {
    const fakeBin = mkdtempSync(join(tmpdir(), 'qalem-docker-'));
    const dockerLog = join(fakeBin, 'docker.log');
    const fakeDocker = join(fakeBin, 'docker');

    writeFileSync(
      fakeDocker,
      '#!/bin/sh\nprintf "%s\\n" "$*" >> "$DOCKER_LOG"\n' +
        'if [ "$1 $2" = "container inspect" ]; then exit 1; fi\n',
      { mode: 0o755 },
    );

    try {
      execFileSync('sh', ['infra/validation/recreate-qalem-refork-exec.sh'], {
        cwd: resolve('.'),
        env: {
          ...process.env,
          DOCKER_LOG: dockerLog,
          PATH: `${fakeBin}${delimiter}${process.env.PATH ?? ''}`,
        },
      });

      expect(readFileSync(dockerLog, 'utf8')).toContain('--memory 10g');
    } finally {
      rmSync(fakeBin, { recursive: true, force: true });
    }
  });

  it('bounds Node memory in the Docker builder before compilation', () => {
    const dockerfile = readFileSync(resolve('Dockerfile'), 'utf8');
    const builderStart = dockerfile.indexOf('FROM base AS builder');
    const buildStart = dockerfile.indexOf('RUN pnpm build', builderStart);
    const memoryLimit = dockerfile.indexOf(
      'ENV NODE_OPTIONS=--max-old-space-size=2560',
      builderStart,
    );

    expect(memoryLimit).toBeGreaterThan(builderStart);
    expect(memoryLimit).toBeLessThan(buildStart);
  });
});
