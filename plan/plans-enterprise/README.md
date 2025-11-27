# InsightDesk — Engineering Documentation

> **Enterprise Customer Support & Ticketing Platform**  
> Next.js + Express + PostgreSQL + Valkey + BullMQ + WebSockets

---

## 📖 Documentation Index

This documentation provides a comprehensive, production-grade engineering plan for InsightDesk. Each section is designed to be actionable and follows enterprise best practices.

---

## Quick Navigation

| Section                                                 | Description                               | Status     |
| ------------------------------------------------------- | ----------------------------------------- | ---------- |
| [01 - Architecture](./01-architecture/01-overview.md)   | System design, tech stack, infrastructure | ✅ Complete |
| [02 - Database](./02-database/01-erd.md)                | Schema, migrations, indexing, backups     | ✅ Complete |
| [03 - API](./03-api/01-overview.md)                     | REST API design, versioning, endpoints    | ✅ Complete |
| [04 - Modules](./04-modules/00-README.md)               | Feature modules implementation details    | ✅ Complete |
| [05 - Security](./05-security/01-overview.md)           | OWASP, authentication, data protection    | ✅ Complete |
| [06 - Frontend](./06-frontend/01-overview.md)           | Next.js architecture, a11y, state         | ✅ Complete |
| [07 - DevOps](./07-devops/01-overview.md)               | CI/CD, Docker, monitoring, deployment     | ✅ Complete |
| [08 - Testing](./08-testing/01-strategy.md)             | Test strategy, unit, integration, e2e     | ✅ Complete |
| [09 - Performance](./09-performance/01-optimization.md) | Caching, DB tuning, load testing          | ✅ Complete |
| [10 - Milestones](./10-milestones/01-roadmap.md)        | Roadmap, MVP scope, releases              | ✅ Complete |

---

## 🚀 Getting Started

### Prerequisites

- Bun 1.1+ (runtime & package manager)
- PostgreSQL 15+
- Valkey 7+ (Redis-compatible)

### Quick Start

```bash
# Clone the repository
git clone https://github.com/your-org/insight-desk.git
cd insight-desk

# Install dependencies
bun install

# Setup environment
cp .env.example .env.local

# Run database migrations
bun run db:migrate

# Start development servers
bun run dev
```

---

## 🏗️ Architecture At-a-Glance

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENTS                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │   Web    │  │  Mobile  │  │  Email   │  │   API    │        │
│  │  (Next)  │  │  (PWA)   │  │ Gateway  │  │ Clients  │        │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘        │
└───────┼─────────────┼─────────────┼─────────────┼───────────────┘
        │             │             │             │
        └─────────────┴──────┬──────┴─────────────┘
                             │
┌────────────────────────────┼────────────────────────────────────┐
│                    LOAD BALANCER                                 │
│                      (nginx/ALB)                                 │
└────────────────────────────┼────────────────────────────────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
┌───────▼───────┐   ┌────────▼────────┐   ┌──────▼──────┐
│   API Server  │   │ WebSocket Server│   │   Workers   │
│   (Express)   │   │   (Socket.IO)   │   │  (BullMQ)   │
└───────┬───────┘   └────────┬────────┘   └──────┬──────┘
        │                    │                    │
        └────────────────────┼────────────────────┘
                             │
┌────────────────────────────────────────────────────────────────────┐
│                      DATA LAYER                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  PostgreSQL  │  │    Valkey    │  │ Cloudinary/  │          │
│  │  (Primary)   │  │ (Cache/Queue)│  │     S3       │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📁 Project Structure

```
insight-desk/
├── docs/                    # 📚 This documentation
├── backend/                 # 🔧 Express API server
│   ├── src/
│   │   ├── modules/         # Feature modules
│   │   ├── core/            # Shared infrastructure
│   │   ├── sockets/         # WebSocket handlers
│   │   └── workers/         # Background jobs
│   └── tests/
├── frontend/                # 🎨 Next.js application
│   ├── app/                 # App Router pages
│   ├── components/          # React components
│   ├── hooks/               # Custom hooks
│   ├── lib/                 # Utilities
│   └── services/            # API clients
├── packages/                # 📦 Shared packages
│   ├── types/               # Shared TypeScript types
│   ├── utils/               # Shared utilities
│   └── config/              # Shared configuration
└── infrastructure/          # 🐳 Docker, K8s configs
```

---

## 🎯 Core Features

| Feature            | Description                            | Documentation                                                  |
| ------------------ | -------------------------------------- | -------------------------------------------------------------- |
| **Authentication** | JWT + Refresh tokens, RBAC, 2FA        | [Auth Module](./04-modules/01-auth/01-overview.md)             |
| **Ticketing**      | Full lifecycle, SLA, assignment        | [Tickets Module](./04-modules/02-tickets/01-overview.md)       |
| **Real-time Chat** | WebSocket messaging, typing indicators | [Real-time Module](./04-modules/03-realtime/01-overview.md)    |
| **Knowledge Base** | Articles, categories, search           | [KB Module](./04-modules/04-knowledge-base/01-overview.md)     |
| **Automation**     | Workflow rules, triggers, actions      | [Automation Module](./04-modules/05-automation/01-overview.md) |
| **Analytics**      | Metrics, dashboards, reports           | [Analytics](./03-api/06-analytics.md)                          |

---

## 🔐 Security Highlights

- **OWASP Top 10** compliance
- **Password policies** with Argon2id hashing
- **2FA/MFA** support
- **Rate limiting** per IP and user
- **Audit logging** for all sensitive operations
- **Data encryption** at rest and in transit

See [Security Documentation](./05-security/01-overview.md) for details.

---

## 📊 Service Level Objectives (SLOs)

| Metric               | Target      | Measurement       |
| -------------------- | ----------- | ----------------- |
| API Availability     | 99.9%       | Uptime monitoring |
| API Latency (p95)    | < 200ms     | APM metrics       |
| WebSocket Latency    | < 100ms     | Real-time metrics |
| Error Rate           | < 0.1%      | Error tracking    |
| Recovery Time (RTO)  | < 1 hour    | Incident tracking |
| Recovery Point (RPO) | < 5 minutes | Backup frequency  |

---

## 🛠️ Technology Stack

### Backend
- **Runtime**: Bun 1.1+
- **Framework**: Express.js 4.x (Bun-compatible)
- **Language**: TypeScript 5.x
- **Database**: PostgreSQL 15+
- **ORM**: Prisma
- **Cache/Queue**: Valkey 7+ (Redis-compatible)
- **Background Jobs**: BullMQ
- **Real-time**: Socket.IO

### Frontend
- **Framework**: Next.js 14+ (App Router)
- **Language**: TypeScript 5.x
- **Styling**: Tailwind CSS
- **State**: Zustand / TanStack Query
- **Forms**: React Hook Form + Zod

### DevOps
- **Containers**: Docker
- **CI/CD**: GitHub Actions
- **Monitoring**: Prometheus + Grafana
- **Logging**: Pino → ELK/Loki
- **Error Tracking**: Sentry

---

## 📋 Development Phases

| Phase | Focus                                                                        | Duration | Status     |
| ----- | ---------------------------------------------------------------------------- | -------- | ---------- |
| 1     | [Foundation](./10-milestones/01-roadmap.md#phase-1-foundation)               | 4 weeks  | 📋 Planning |
| 2     | [Core Features](./10-milestones/01-roadmap.md#phase-2-core-features)         | 6 weeks  | 📋 Planning |
| 3     | [Advanced Features](./10-milestones/01-roadmap.md#phase-3-advanced-features) | 6 weeks  | 📋 Planning |
| 4     | [Enterprise](./10-milestones/01-roadmap.md#phase-4-enterprise-features)      | 6 weeks  | 📋 Planning |
| 5     | [Scale & Optimize](./10-milestones/01-roadmap.md#phase-5-scale--optimize)    | Ongoing  | 📋 Planning |

**MVP Target**: 10 weeks ([see MVP scope](./10-milestones/02-mvp.md))

---

## 📚 Additional Resources

- [Architecture Decision Records (ADR)](./adr/README.md)
- [API Changelog](./CHANGELOG.md)
- [Contributing Guide](../CONTRIBUTING.md)
- [Glossary](./GLOSSARY.md)

---

## 📞 Support

For questions about this documentation:
- Create an issue in the repository
- Contact the engineering team

---

*Last Updated: November 2025*
