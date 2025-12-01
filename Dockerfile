# ─────────────────────────────────────────────────────────────
# InsightDesk Production Dockerfile
# Multi-stage build for optimal image size
# ─────────────────────────────────────────────────────────────

# ─────────────────────────────────────────────────────────────
# Base stage - Node.js 24 LTS with Bun for package management
# ─────────────────────────────────────────────────────────────
FROM --platform=linux/amd64 node:24-alpine AS base
WORKDIR /app

# Install bun for package management only
RUN npm install -g bun

# ─────────────────────────────────────────────────────────────
# Dependencies stage - Install all dependencies for build
# ─────────────────────────────────────────────────────────────
FROM base AS deps

# Copy package files
COPY package.json bun.lock ./

# Install ALL dependencies (need devDeps for build)
RUN bun install --frozen-lockfile

# ─────────────────────────────────────────────────────────────
# Build stage - Compile TypeScript to JavaScript
# ─────────────────────────────────────────────────────────────
FROM base AS builder
WORKDIR /app

# Copy dependencies
COPY --from=deps /app/node_modules ./node_modules

# Copy source and config files
COPY package.json tsconfig.json ./
COPY src ./src

# Build TypeScript and resolve path aliases
RUN bun run build

# ─────────────────────────────────────────────────────────────
# Production dependencies - Install only prod deps
# ─────────────────────────────────────────────────────────────
FROM base AS prod-deps
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# ─────────────────────────────────────────────────────────────
# Production stage - Minimal runtime image
# ─────────────────────────────────────────────────────────────
FROM --platform=linux/amd64 node:24-alpine AS production
WORKDIR /app

# Set environment
ENV NODE_ENV=production

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 insightdesk

# Copy production node_modules
COPY --from=prod-deps --chown=insightdesk:nodejs /app/node_modules ./node_modules

# Copy compiled JavaScript
COPY --from=builder --chown=insightdesk:nodejs /app/dist ./dist

# Copy package.json (needed for module resolution)
COPY --chown=insightdesk:nodejs package.json ./

# Copy drizzle config and migrations for db:migrate
COPY --chown=insightdesk:nodejs drizzle.config.ts ./
COPY --chown=insightdesk:nodejs src/db/migrations ./src/db/migrations

# Switch to non-root user
USER insightdesk

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1

# Start the compiled server
CMD ["node", "dist/index.js"]
