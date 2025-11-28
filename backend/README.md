# InsightDesk Backend

Express 5.1 + Drizzle ORM + Better Auth + Socket.IO + pg-boss

## Quick Start

```bash
# Install dependencies
bun install

# Start PostgreSQL and Valkey
docker compose up -d postgres valkey

# Run migrations
bun db:migrate

# Seed demo data
bun db:seed

# Start dev server
bun dev
```

## Scripts

| Command | Description |
|---------|-------------|
| `bun dev` | Start development server with hot reload |
| `bun start` | Start production server |
| `bun db:generate` | Generate migration from schema changes |
| `bun db:migrate` | Apply pending migrations |
| `bun db:push` | Push schema directly (dev only) |
| `bun db:studio` | Open Drizzle Studio GUI |
| `bun db:seed` | Seed demo data |
| `bun typecheck` | TypeScript type checking |
| `bun test` | Run tests |

## Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

## API Documentation

See `docs-solo/06-api-design.md` for full API documentation.
