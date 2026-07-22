# ---- Edge: stable public relay ----
# This target is deliberately independent from the Node build stages. Coolify can
# deploy it once as the public Qalem entrypoint while the application target is
# replaced behind it without changing the public router.
FROM nginx:1.27-alpine AS edge

COPY infra/coolify/qalem-edge.nginx.conf /etc/nginx/nginx.conf

EXPOSE 3000

# ---- Stage 1: Base ----
FROM node:22-alpine AS base

RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate

WORKDIR /app

# ---- Stage 2: Dependencies ----
FROM base AS deps

# Native build tools for sharp, @napi-rs/canvas
RUN apk add --no-cache python3 build-base g++ cairo-dev pango-dev jpeg-dev giflib-dev librsvg-dev

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/ ./packages/
COPY scripts/sync-maic-importer.mjs ./scripts/sync-maic-importer.mjs

RUN pnpm install --frozen-lockfile

# ---- Stage 3: Builder ----
FROM base AS builder

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages ./packages
COPY . .
COPY --from=deps /app/public/vendor/maic-importer ./public/vendor/maic-importer

ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY}

RUN pnpm build

# ---- Stage 4: Dedicated BullMQ worker ----
FROM base AS worker

ENV NODE_ENV=production
ENV NODE_OPTIONS=--max-old-space-size=2560

RUN apk add --no-cache libc6-compat cairo pango jpeg giflib librsvg ffmpeg font-dejavu
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app ./

USER nextjs

CMD ["pnpm", "run", "start:workers"]

# ---- Stage 5: Web runner ----
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
ENV NODE_OPTIONS=--max-old-space-size=1152

RUN apk add --no-cache libc6-compat cairo pango jpeg giflib librsvg ffmpeg curl

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
