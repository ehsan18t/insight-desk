# InsightDesk Backend

Express 5.1 + Drizzle ORM + Better Auth + Socket.IO + BullMQ

## Quick Start

```bash
# One-command setup (first time)
bun run setup

# Or manually:
copy .env.development .env   # Pre-configured for Docker
bun install
bun run docker:up            # Start PostgreSQL, Valkey, MinIO, Mailpit
bun run db:push              # Push schema to database
bun run dev                  # Start dev server
```

## Development Services

| Service    | Port       | Description                          |
| ---------- | ---------- | ------------------------------------ |
| API Server | 3001       | http://localhost:3001                |
| PostgreSQL | 5432       | Database                             |
| Valkey     | 6379       | Cache & job queue (Redis-compatible) |
| Mailpit    | 8025, 1025 | Email testing UI & SMTP              |
| MinIO      | 9000, 9001 | S3 storage & console                 |

## Scripts

| Command               | Description                              |
| --------------------- | ---------------------------------------- |
| `bun run setup`       | Full dev environment setup               |
| `bun run dev`         | Start development server with hot reload |
| `bun run start`       | Start production server                  |
| `bun run docker:up`   | Start all Docker dev services            |
| `bun run docker:down` | Stop all Docker dev services             |
| `bun run docker:logs` | View Docker service logs                 |
| `bun run db:generate` | Generate migration from schema changes   |
| `bun run db:migrate`  | Apply pending migrations                 |
| `bun run db:push`     | Push schema directly (dev only)          |
| `bun run db:studio`   | Open Drizzle Studio GUI                  |
| `bun run db:seed`     | Seed demo data                           |
| `bun run typecheck`   | TypeScript type checking                 |
| `bun run check`       | Run Biome linting & formatting check     |
| `bun run test`        | Run tests                                |

## Environment Variables

For development, `.env.development` is pre-configured for Docker services.

```bash
copy .env.development .env
```

For production, copy `.env.example` and configure all values.

## API Documentation

See `plan/06-api-design.md` for full API documentation.


## Dev URLs
- **API:** http://localhost:3001
- **Mailpit UI:** http://localhost:8025 (view sent emails)
- **MinIO Console:** http://localhost:9001 (minioadmin/minioadmin)
- **Drizzle Studio:** bun run db:studio