import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

const nextDirectory = resolve('.next');
const cacheDirectory = join(nextDirectory, 'cache');

function removeContents(directory, preservedNames = new Set()) {
  if (!existsSync(directory)) return;

  for (const name of readdirSync(directory)) {
    if (preservedNames.has(name)) continue;
    rmSync(join(directory, name), { recursive: true, force: true, maxRetries: 3 });
  }
}

// Nixpacks mounts .next/cache as a BuildKit cache volume. Its mount point
// cannot be removed (EBUSY), but its contents must be cleared so a previous
// route compilation cannot leak into the next production image.
removeContents(nextDirectory, new Set(['cache']));
removeContents(cacheDirectory);
