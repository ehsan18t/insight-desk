# ─────────────────────────────────────────────────────────────
# InsightDesk Production Dockerfile
# Multi-stage build for optimal image size
# ─────────────────────────────────────────────────────────────

# ─────────────────────────────────────────────────────────────
# Base stage - Node.js 24 LTS runtime
# ─────────────────────────────────────────────────────────────
FROM --platform=linux/amd64 node:24-alpine AS base
WORKDIR /app

# Install bun for package management only
RUN npm install -g bun

# ─────────────────────────────────────────────────────────────
# Dependencies stage - Install production dependencies
# ─────────────────────────────────────────────────────────────
FROM base AS deps

# Copy package files
COPY package.json bun.lock ./

# Install ALL dependencies (including dev deps for tsx)
RUN bun install --frozen-lockfile

# ─────────────────────────────────────────────────────────────
# Production stage - Run with tsx (handles TS/ESM correctly)
# ─────────────────────────────────────────────────────────────
FROM --platform=linux/amd64 node:24-alpine AS production
WORKDIR /app

# Set environment
ENV NODE_ENV=production

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 insightdesk

# Copy node_modules (includes tsx for running TypeScript)
COPY --from=deps --chown=insightdesk:nodejs /app/node_modules ./node_modules

# Copy package.json and tsconfig
COPY --chown=insightdesk:nodejs package.json tsconfig.json ./

# Copy source code
COPY --chown=insightdesk:nodejs src ./src

# Copy drizzle config for migrations
COPY --chown=insightdesk:nodejs drizzle.config.ts ./

# Copy scripts needed for production setup
COPY --chown=insightdesk:nodejs scripts ./scripts

# Switch to non-root user
USER insightdesk

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1

# Start the server with tsx (handles TypeScript + ESM module resolution)
CMD ["npx", "tsx", "src/index.ts"]
