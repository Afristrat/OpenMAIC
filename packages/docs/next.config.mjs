import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMDX } from 'fumadocs-mdx/next';
import { DOCS_BASE_PATH } from './lib/locales.mjs';

const withMDX = createMDX();

// packages/docs is built standalone (excluded from the root workspace, own
// lockfile). Without an explicit root, Next infers it by walking up to the
// repository's pnpm-workspace.yaml, then Turbopack compiles the app's proxy.ts /
// instrumentation.ts, which import modules this site does not have.
const docsRoot = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  turbopack: { root: docsRoot },
  // Static export: served as plain files by nginx, no Node server.
  output: 'export',
  // Target deploy path: open.maic.chat/docs
  basePath: DOCS_BASE_PATH,
  // Static export cannot optimize images at runtime.
  images: {
    unoptimized: true,
  },
};

export default withMDX(config);
