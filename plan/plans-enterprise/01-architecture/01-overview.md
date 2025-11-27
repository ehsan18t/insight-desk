# Architecture Overview

> System architecture for InsightDesk — Enterprise Customer Support Platform

---

## Table of Contents

- [System Context](#system-context)
- [High-Level Architecture](#high-level-architecture)
- [Component Breakdown](#component-breakdown)
- [Data Flow](#data-flow)
- [Communication Patterns](#communication-patterns)
- [Related Documents](#related-documents)

---

## System Context

InsightDesk operates as a multi-tenant customer support platform connecting three primary user types:

```
                                    ┌─────────────────┐
                                    │   InsightDesk   │
                                    │    Platform     │
                                    └────────┬────────┘
                                             │
           ┌─────────────────────────────────┼─────────────────────────────────┐
           │                                 │                                 │
    ┌──────▼──────┐                  ┌───────▼───────┐                ┌───────▼───────┐
    │  Customers  │                  │    Agents     │                │    Admins     │
    │             │                  │               │                │               │
    │ • Submit    │                  │ • Handle      │                │ • Configure   │
    │   tickets   │                  │   tickets     │                │   system      │
    │ • View KB   │                  │ • Chat with   │                │ • Manage      │
    │ • Track     │                  │   customers   │                │   teams       │
    │   status    │                  │ • Use KB      │                │ • View        │
    └─────────────┘                  └───────────────┘                │   analytics   │
                                                                      └───────────────┘
```

---

## High-Level Architecture

InsightDesk follows a **layered architecture** with clear separation of concerns:

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              PRESENTATION LAYER                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                         Next.js Application                              │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐  │   │
│  │  │  Customer    │  │   Agent      │  │   Admin      │  │  Public     │  │   │
│  │  │  Portal      │  │  Dashboard   │  │  Dashboard   │  │  KB Site    │  │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘  └─────────────┘  │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        │ HTTPS / WSS
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              API GATEWAY LAYER                                   │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                    Load Balancer (nginx / ALB)                           │   │
│  │  • TLS Termination  • Rate Limiting  • Request Routing  • Health Checks │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────┘
                                        │
                    ┌───────────────────┼───────────────────┐
                    │                   │                   │
                    ▼                   ▼                   ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              APPLICATION LAYER                                   │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐              │
│  │   API Servers    │  │  WebSocket       │  │   Background     │              │
│  │   (Express)      │  │  Servers         │  │   Workers        │              │
│  │                  │  │  (Socket.IO)     │  │   (BullMQ)       │              │
│  │  • REST API      │  │                  │  │                  │              │
│  │  • Auth/RBAC     │  │  • Real-time     │  │  • SLA Timers    │              │
│  │  • Business      │  │    messaging     │  │  • Notifications │              │
│  │    Logic         │  │  • Presence      │  │  • Auto-close    │              │
│  │  • Validation    │  │  • Typing        │  │  • Aggregations  │              │
│  └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘              │
│           │                     │                     │                         │
│           └─────────────────────┴─────────────────────┘                         │
│                                 │                                               │
└─────────────────────────────────┼───────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              DATA LAYER                                          │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐              │
│  │    PostgreSQL    │  │     Valkey       │  │   File Storage   │              │
│  │                  │  │                  │  │                  │              │
│  │  • Primary Data  │  │  • Session Cache │  │  • Cloudinary    │              │
│  │  • Transactions  │  │  • API Cache     │  │  • S3 Compatible │              │
│  │  • Full-text     │  │  • Job Queues    │  │  • Attachments   │              │
│  │    Search        │  │  • Pub/Sub       │  │  • Media         │              │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘              │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Component Breakdown

### Frontend Components

| Component | Technology | Purpose |
|-----------|------------|---------|
| Customer Portal | Next.js App Router | Ticket submission, status tracking, KB browsing |
| Agent Dashboard | Next.js App Router | Ticket management, real-time chat, internal tools |
| Admin Dashboard | Next.js App Router | System configuration, team management, analytics |
| Public KB | Next.js (SSG/ISR) | SEO-optimized public knowledge base |

### Backend Services

| Service | Technology | Responsibility |
|---------|------------|----------------|
| API Server | Express.js + Bun | REST API, authentication, business logic |
| WebSocket Server | Socket.IO + Bun | Real-time messaging, presence, notifications |
| Worker Service | BullMQ + Bun | Background jobs, scheduled tasks, SLA processing |

### Data Stores

| Store | Technology | Usage |
|-------|------------|-------|
| Primary Database | PostgreSQL 15+ | All persistent data, transactions, full-text search |
| Cache Layer | Valkey 7+ | Session cache, API responses, rate limiting |
| Job Queue | Valkey + BullMQ | Background job processing, delayed tasks |
| File Storage | Cloudinary/S3 | Attachments, images, documents |

---

## Data Flow

### Ticket Creation Flow

```
┌──────────┐      ┌──────────┐      ┌──────────┐      ┌──────────┐
│ Customer │      │   API    │      │ Database │      │  Worker  │
│  Portal  │      │  Server  │      │  (PG)    │      │ (BullMQ) │
└────┬─────┘      └────┬─────┘      └────┬─────┘      └────┬─────┘
     │                 │                 │                 │
     │ 1. Submit       │                 │                 │
     │    Ticket       │                 │                 │
     │────────────────>│                 │                 │
     │                 │                 │                 │
     │                 │ 2. Validate     │                 │
     │                 │    & Create     │                 │
     │                 │────────────────>│                 │
     │                 │                 │                 │
     │                 │ 3. Ticket       │                 │
     │                 │    Created      │                 │
     │                 │<────────────────│                 │
     │                 │                 │                 │
     │                 │ 4. Queue SLA    │                 │
     │                 │    & Notify     │                 │
     │                 │─────────────────────────────────>│
     │                 │                 │                 │
     │ 5. Ticket ID    │                 │                 │
     │    Response     │                 │                 │
     │<────────────────│                 │                 │
     │                 │                 │                 │
     │                 │                 │ 6. Process SLA  │
     │                 │                 │<────────────────│
     │                 │                 │                 │
```

### Real-time Chat Flow

```
┌──────────┐      ┌──────────┐      ┌──────────┐      ┌──────────┐
│ Customer │      │ WebSocket│      │  Valkey  │      │  Agent   │
│  Client  │      │  Server  │      │  Pub/Sub │      │  Client  │
└────┬─────┘      └────┬─────┘      └────┬─────┘      └────┬─────┘
     │                 │                 │                 │
     │ 1. Connect      │                 │                 │
     │    (WSS)        │                 │                 │
     │────────────────>│                 │                 │
     │                 │                 │                 │
     │ 2. Join Room    │                 │                 │
     │    (ticket_123) │                 │                 │
     │────────────────>│                 │                 │
     │                 │                 │                 │
     │ 3. Send Message │                 │                 │
     │────────────────>│                 │                 │
     │                 │                 │                 │
     │                 │ 4. Publish      │                 │
     │                 │────────────────>│                 │
     │                 │                 │                 │
     │                 │                 │ 5. Broadcast    │
     │                 │                 │────────────────>│
     │                 │                 │                 │
     │ 6. Message ACK  │                 │                 │
     │<────────────────│                 │                 │
     │                 │                 │                 │
```

---

## Communication Patterns

### Synchronous (Request-Response)

- **REST API**: Client → API Server → Response
- **Database Queries**: API Server → PostgreSQL → Result
- **Cache Reads**: API Server → Valkey → Cached Data

### Asynchronous (Event-Driven)

- **WebSocket Events**: Bidirectional real-time communication
- **Background Jobs**: API Server → Valkey Queue → Worker
- **Pub/Sub**: Valkey channels for cross-server messaging

### Message Patterns

| Pattern | Use Case | Technology |
|---------|----------|------------|
| Request-Response | API calls | HTTP/REST |
| Publish-Subscribe | Real-time updates | Socket.IO + Valkey |
| Work Queue | Background processing | BullMQ |
| Delayed Jobs | SLA timers, auto-close | BullMQ delayed |

---

## Scalability Considerations

### Horizontal Scaling Points

1. **API Servers**: Stateless, scale behind load balancer
2. **WebSocket Servers**: Use Valkey adapter for Socket.IO
3. **Workers**: Scale based on queue depth
4. **Database**: Read replicas for query scaling

### Bottleneck Mitigations

| Bottleneck | Solution |
|------------|----------|
| Database writes | Connection pooling, write batching |
| Cache misses | Warm cache, cache-aside pattern |
| WebSocket connections | Horizontal scaling with Valkey adapter |
| File uploads | Direct-to-cloud uploads with signed URLs |

---

## Related Documents

- [Technology Stack](./tech-stack.md) — Detailed technology choices and rationale
- [Infrastructure](./infrastructure.md) — Cloud architecture and deployment
- [Scalability](./scalability.md) — Scaling strategies and capacity planning
- [Database Design](../02-database/erd.md) — Entity relationships and schema

---

*Next: [Technology Stack →](./tech-stack.md)*
