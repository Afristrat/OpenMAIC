import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

const nextConfig: NextConfig = {
  output:
    process.env.VERCEL || process.env.NEXT_PUBLIC_E2E_TEST_MODE === 'true'
      ? undefined
      : 'standalone',
  transpilePackages: ['mathml2omml', 'pptxgenjs', '@openmaic/importer'],
  // These agent packages do a runtime `import(specifier)` with a computed
  // specifier (to lazily load node:fs/os/path without breaking browser/Vite
  // builds). webpack can't statically analyze that and bundling it throws
  // "Cannot find module as expression is too dynamic" at runtime on the server
  // (the "Edit with AI" Pro-mode path), which broke the #619 keep-alive e2e.
  // Mark them server-external so Next loads them natively and the dynamic
  // import resolves as a real Node call.
  // pdfkit loads its built-in AFM font files at runtime. Keeping it external
  // makes those assets available in the standalone production image.
  // unpdf embeds PDF.js, whose runtime module resolution is intentionally
  // dynamic. Loading it natively avoids an incomplete webpack analysis while
  // Next's standalone trace still ships the direct dependency.
  serverExternalPackages: [
    '@earendil-works/pi-ai',
    '@earendil-works/pi-agent-core',
    'bullmq',
    'pdfkit',
    'unpdf',
  ],
  experimental: {
    // Coolify builds share ServeurAI with the live platform. The default is
    // based on host CPUs (27 here), which can starve the serving containers
    // during static generation. A bounded build remains deterministic without
    // competing with classroom traffic.
    cpus: 2,
    proxyClientMaxBodySize: '200mb',
  },
  async headers() {
    const extraAncestors = process.env.ALLOWED_FRAME_ANCESTORS?.trim();
    const frameAncestors = extraAncestors ? `'self' ${extraAncestors}` : "'self'";

    return [
      {
        source: '/(.*)',
        headers: [
          // X-Frame-Options only supports SAMEORIGIN (no allow-list),
          // so we omit it when custom ancestors are configured (LTI embedding).
          ...(!extraAncestors ? [{ key: 'X-Frame-Options', value: 'SAMEORIGIN' }] : []),
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(self), geolocation=()',
          },
          {
            key: 'Content-Security-Policy',
            value: `frame-ancestors ${frameAncestors}`,
          },
        ],
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  // Suppress source map upload warnings when no auth token is set
  silent: true,
  // Disable source map upload (self-hosted GlitchTip, not Sentry SaaS)
  sourcemaps: {
    disable: true,
  },
});
