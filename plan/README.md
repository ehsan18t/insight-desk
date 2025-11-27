# InsightDesk - Solo Developer Documentation

> **Professional-grade helpdesk platform built by a single developer**

[![Bun](https://img.shields.io/badge/Bun-1.3.3-f9f1e1)](https://bun.sh)
[![Next.js](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org)
[![Express](https://img.shields.io/badge/Express-5.1-green)](https://expressjs.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue)](https://typescriptlang.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-18-336791)](https://postgresql.org)

---

## 🎯 What is InsightDesk?

InsightDesk is a modern, full-featured helpdesk and customer support platform designed to be built and maintained by a **solo developer**. It combines powerful features with pragmatic architecture choices that prioritize:

- **Simplicity over complexity**
- **PostgreSQL as the backbone** (single database for everything)
- **Docker for easy deployment**
- **Real-time updates without infrastructure headaches**

---

## 🏗️ Architecture at a Glance

```
┌─────────────────────────────────────────────────────────────┐
│                    Docker Compose                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐   │
│  │   Frontend   │    │   Backend    │    │    Valkey    │   │
│  │  Next.js 16  │◄──►│  Express 5.1 │◄──►│    Cache     │   │
│  │   :3000      │    │    :3001     │    │    :6379     │   │
│  └──────────────┘    └──────┬───────┘    └──────────────┘   │
│                             │                               │
│                             │ Socket.IO                     │
│                             │ pg-boss                       │
│                             ▼                               │
│                      ┌──────────────┐                       │
│                      │  PostgreSQL  │                       │
│                      │      18      │                       │
│                      │    :5432     │                       │
│                      └──────────────┘                       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 📚 Documentation Index

### Foundation
| #   | Document                             | Description                                 |
| --- | ------------------------------------ | ------------------------------------------- |
| 01  | [Principles](./01-principles.md)     | Solo developer mindset & decision framework |
| 02  | [Tech Stack](./02-tech-stack.md)     | Complete technology choices with versions   |
| 03  | [Architecture](./03-architecture.md) | System design & folder structure            |

### Database & API
| #   | Document                               | Description                      |
| --- | -------------------------------------- | -------------------------------- |
| 04  | [Database](./04-database.md)           | Drizzle ORM schemas & migrations |
| 05  | [Core Features](./05-core-features.md) | MVP feature specifications       |
| 06  | [API Design](./06-api-design.md)       | Express routes & controllers     |

### Frontend & Auth
| #   | Document                                 | Description                      |
| --- | ---------------------------------------- | -------------------------------- |
| 07  | [Frontend](./07-frontend.md)             | Next.js 16 & React 19.2 patterns |
| 08  | [Auth & Security](./08-auth-security.md) | Better Auth implementation       |

### Real-time & Jobs
| #   | Document                                   | Description                   |
| --- | ------------------------------------------ | ----------------------------- |
| 09  | [Real-time](./09-realtime.md)              | Socket.IO chat & live updates |
| 10  | [Background Jobs](./10-background-jobs.md) | pg-boss patterns & SLA timers |

### Quality & Deployment
| #   | Document                           | Description                    |
| --- | ---------------------------------- | ------------------------------ |
| 11  | [Testing](./11-testing.md)         | Vitest & Playwright strategies |
| 12  | [DevOps Lite](./12-devops-lite.md) | Docker Compose & deployment    |
| 13  | [Timeline](./13-timeline.md)       | 8-10 week development plan     |

---

## 🚀 Quick Start

### Prerequisites

- [Bun 1.3.3+](https://bun.sh) - Fast JavaScript runtime
- [Docker Desktop](https://docker.com/products/docker-desktop) - Container platform
- [VS Code](https://code.visualstudio.com) - Recommended editor

### 1. Clone & Setup

```bash
# Clone the repository
git clone https://github.com/yourusername/insight-desk.git
cd insight-desk

# Copy environment files
cp .env.example .env
```

### 2. Start with Docker

```bash
# Start all services (PostgreSQL, Valkey, Backend, Frontend)
docker compose up -d

# View logs
docker compose logs -f

# Stop everything
docker compose down
```

### 3. Access the Application

| Service     | URL                        | Description             |
| ----------- | -------------------------- | ----------------------- |
| Frontend    | http://localhost:3000      | Customer & Agent portal |
| Backend API | http://localhost:3001      | REST API + Socket.IO    |
| API Docs    | http://localhost:3001/docs | Swagger documentation   |

### 4. Development Mode

```bash
# Terminal 1 - Start infrastructure
docker compose up db valkey -d

# Terminal 2 - Backend with hot reload
cd backend && bun run dev

# Terminal 3 - Frontend with hot reload
cd frontend && bun run dev
```

---

## 📁 Project Structure

```
insight-desk/
├── docker-compose.yml          # All services orchestration
├── .env.example                 # Environment template
├── .env                         # Local environment (git ignored)
│
├── frontend/                    # Next.js 16 application
│   ├── package.json
│   ├── next.config.ts
│   ├── tailwind.config.ts
│   └── src/
│       ├── app/                 # App Router pages
│       ├── components/          # React components
│       ├── hooks/               # Custom hooks
│       ├── lib/                 # Utilities
│       └── stores/              # Zustand stores
│
├── backend/                     # Express 5.1 API server
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts             # Entry point
│       ├── routes/              # API routes
│       ├── controllers/         # Request handlers
│       ├── services/            # Business logic
│       ├── socket/              # Socket.IO handlers
│       ├── jobs/                # pg-boss job definitions
│       ├── db/                  # Drizzle schemas & migrations
│       └── middleware/          # Auth, validation, etc.
│
├── docs-solo/                   # This documentation
│
└── shared/                      # Shared types (optional)
    └── types/
```

---

## 🎯 Core Features (MVP)

### For Customers
- ✅ Submit support tickets via web portal
- ✅ Real-time status updates
- ✅ Live chat with agents
- ✅ View ticket history
- ✅ Email notifications

### For Agents
- ✅ Unified inbox for all tickets
- ✅ Real-time ticket assignment
- ✅ Internal notes & collaboration
- ✅ Canned responses
- ✅ Customer context sidebar

### For Admins
- ✅ Team & agent management
- ✅ SLA configuration
- ✅ Basic analytics dashboard
- ✅ Email template customization

---

## 🔧 Technology Decisions

| Decision  | Choice               | Why                                |
| --------- | -------------------- | ---------------------------------- |
| Runtime   | Bun                  | Faster than Node, built-in tools   |
| Frontend  | Next.js 16           | App Router, RSC, great DX          |
| Backend   | Express 5.1          | Mature, separate from frontend     |
| Database  | PostgreSQL 18        | Rock solid, handles everything     |
| ORM       | Drizzle              | Type-safe, fast, SQL-like          |
| Jobs      | pg-boss              | Uses PostgreSQL, no extra infra    |
| Cache     | Valkey               | Socket.IO adapter, rate limiting   |
| Real-time | Socket.IO            | Full-duplex, room support          |
| Auth      | Better Auth          | Simple, secure, batteries included |
| Styling   | Tailwind + shadcn/ui | Fast development, accessible       |

---

## 📖 Reading Order

If you're starting fresh, read the docs in this order:

1. **[01-principles.md](./01-principles.md)** - Understand the mindset
2. **[02-tech-stack.md](./02-tech-stack.md)** - Know your tools
3. **[03-architecture.md](./03-architecture.md)** - See the big picture
4. **[04-database.md](./04-database.md)** - Design the data layer
5. **[13-timeline.md](./13-timeline.md)** - Plan your weeks
6. Then dive into specific features as needed

---

## 💡 Philosophy

> "Make it work, make it right, make it fast — in that order."

This documentation embraces:

- **YAGNI** - You Aren't Gonna Need It (yet)
- **KISS** - Keep It Simple, Stupid
- **Boring Technology** - Proven tools over shiny new ones
- **Vertical Slices** - Complete features over horizontal layers

---

## 🤝 Solo Developer Support

Building alone doesn't mean building in isolation:

- 📚 Each doc includes real code snippets
- 🎯 Clear decision rationale for every choice
- ⏱️ Realistic time estimates
- 🔄 Iterative approach - ship early, improve often

---

## 📄 License

MIT License - Build something great!
