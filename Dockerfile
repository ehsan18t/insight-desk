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

# Install ALL dependencies (needed for build)
RUN bun install --frozen-lockfile

# ─────────────────────────────────────────────────────────────
# Builder stage - Build the application
# ─────────────────────────────────────────────────────────────
FROM base AS builder
WORKDIR /app

# Copy dependencies
COPY --from=deps /app/node_modules ./node_modules

# Copy source code
COPY . .

# Build TypeScript to JavaScript
RUN npm run build

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

# Copy built application
COPY --from=builder --chown=insightdesk:nodejs /app/dist ./dist

# Copy node_modules (needed for runtime dependencies)
COPY --from=deps --chown=insightdesk:nodejs /app/node_modules ./node_modules

# Copy package.json (for version info)
COPY --from=builder --chown=insightdesk:nodejs /app/package.json ./

# Copy drizzle config and migrations for database setup
COPY --from=builder --chown=insightdesk:nodejs /app/drizzle.config.ts ./
COPY --from=builder --chown=insightdesk:nodejs /app/src/db/migrations ./src/db/migrations
COPY --from=builder --chown=insightdesk:nodejs /app/src/db/schema ./src/db/schema

# Copy scripts needed for production setup
COPY --from=builder --chown=insightdesk:nodejs /app/scripts ./scripts
COPY --from=builder --chown=insightdesk:nodejs /app/src/lib/db-setup ./src/lib/db-setup
COPY --from=builder --chown=insightdesk:nodejs /app/src/lib/seed ./src/lib/seed

# Switch to non-root user
USER insightdesk

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1

# Start the server with Node.js
CMD ["node", "dist/index.js"]
