# InsightDesk

**Modern Customer Support Made Simple**

A powerful, multi-tenant customer support ticketing system that helps businesses deliver exceptional customer service while keeping teams productive and customers happy.

---

## ✨ What is InsightDesk?

InsightDesk is a complete customer support platform designed for growing businesses. Whether you're a startup handling your first support requests or an established company managing thousands of tickets, InsightDesk scales with your needs.

**One platform. Multiple teams. Unlimited possibilities.**

---

## 🎯 Key Features

### 🎫 Smart Ticket Management
- **Create & Track Tickets** – Customers submit issues, your team resolves them
- **Assign to Agents** – Route tickets to the right team members
- **Priority Levels** – Urgent, High, Medium, Low
- **Status Workflow** – Open → In Progress → Resolved → Closed
- **Bulk Actions** – Update, assign, or close multiple tickets at once
- **Merge Duplicates** – Combine related tickets
- **Activity History** – Complete audit trail of every action

### 💬 Real-Time Communication
- **Customer Replies** – Direct conversation threads
- **Internal Notes** – Private team discussions (invisible to customers)
- **Live Updates** – See changes instantly via WebSocket
- **File Attachments** – Share screenshots, documents, and more
- **Typing Indicators** – Know when someone is responding

### 👥 Team Collaboration

| Role         | Capabilities                                             |
| ------------ | -------------------------------------------------------- |
| **Customer** | Create tickets, view own tickets, reply to conversations |
| **Agent**    | Handle tickets, use templates, collaborate with team     |
| **Admin**    | Manage members, configure settings, access reports       |
| **Owner**    | Full control including billing and organization settings |

### ⏱️ SLA Management
- Priority-based response and resolution targets
- Automatic breach alerts and warnings
- Performance tracking and compliance reports

| Priority | First Response | Resolution |
| -------- | -------------- | ---------- |
| Urgent   | 1 hour         | 4 hours    |
| High     | 4 hours        | 8 hours    |
| Medium   | 8 hours        | 24 hours   |
| Low      | 24 hours       | 72 hours   |

### ⭐ Customer Satisfaction (CSAT)
- Automatic satisfaction surveys after resolution
- 1-5 star ratings with feedback collection
- Agent performance tracking
- Trend analysis over time

### 📊 Analytics Dashboard
- Ticket volume and trends
- Response and resolution times
- Agent performance metrics
- SLA compliance tracking
- Priority distribution

### 🏢 Multi-Tenant Architecture
- Separate organizations with complete data isolation
- Custom branding per organization
- Independent team management

### 📁 Organization Tools
- **Categories** – Hierarchical folder structure
- **Tags** – Flexible labeling system
- **Saved Filters** – Quick access to common views
- **Export** – Download as CSV or Excel

### ⚡ Productivity Features
- **Canned Responses** – Pre-written templates with shortcuts
- **Auto-Close** – Automatically close stale tickets
- **Daily Digests** – Email summaries for agents
- **Email Notifications** – Keep everyone informed

---

## 🛠️ Tech Stack

| Layer        | Technology                   |
| ------------ | ---------------------------- |
| Runtime      | Bun                          |
| Framework    | Express 5.1 + TypeScript     |
| Database     | PostgreSQL + Drizzle ORM     |
| Auth         | Better Auth                  |
| Real-time    | Socket.IO                    |
| Job Queue    | BullMQ + Valkey              |
| File Storage | S3-compatible (MinIO/AWS/R2) |
| Email        | Nodemailer + Templates       |

---

## 🚀 Quick Start

### Prerequisites
- [Bun](https://bun.sh/) installed
- [Docker](https://www.docker.com/) installed and running

### One-Command Setup

```bash
bun run setup
```

### Or Step by Step

```bash
# 1. Clone and install
git clone https://github.com/ehsan18t/insight-desk.git
cd insight-desk
bun install

# 2. Configure environment
copy .env.development .env

# 3. Start services (PostgreSQL, Valkey, MinIO, Mailpit)
bun run docker:up

# 4. Setup database
bun run db:push

# 5. (Optional) Seed demo data
bun run db:seed

# 6. Start development server
bun run dev
```

The API will be available at **http://localhost:3001**

---

## 📦 Development Services

| Service    | Port | URL                                     |
| ---------- | ---- | --------------------------------------- |
| API Server | 3001 | http://localhost:3001                   |
| PostgreSQL | 5432 | Database                                |
| Valkey     | 6379 | Cache & Queue (Redis-compatible)        |
| Mailpit    | 8025 | http://localhost:8025 (Email UI)        |
| MinIO      | 9001 | http://localhost:9001 (Storage Console) |

---

## 📋 Available Scripts

### Development
| Command         | Description                |
| --------------- | -------------------------- |
| `bun run setup` | Full dev environment setup |
| `bun run dev`   | Start with hot reload      |
| `bun run start` | Start production server    |

### Docker
| Command               | Description        |
| --------------------- | ------------------ |
| `bun run docker:up`   | Start all services |
| `bun run docker:down` | Stop all services  |
| `bun run docker:logs` | View service logs  |

### Database
| Command               | Description            |
| --------------------- | ---------------------- |
| `bun run db:generate` | Generate migrations    |
| `bun run db:migrate`  | Apply migrations       |
| `bun run db:push`     | Push schema (dev only) |
| `bun run db:studio`   | Open Drizzle Studio    |
| `bun run db:seed`     | Seed demo data         |

### Quality
| Command             | Description         |
| ------------------- | ------------------- |
| `bun run test`      | Run tests           |
| `bun run typecheck` | TypeScript check    |
| `bun run check`     | Lint & format check |

---

## ⚙️ Environment Variables

**Development**: `.env.development` is pre-configured for Docker services.

```bash
copy .env.development .env
```

**Production**: Copy `.env.example` and configure all values.

---

## 📖 API Documentation

See `plan/06-api-design.md` for full API documentation.

---

## 🎯 Who Is This For?

- **Startups** – Simple setup, grows with your needs
- **Growing Companies** – Scale support without losing quality
- **Agencies** – Manage multiple clients separately
- **SaaS Companies** – Professional support that matches your product

---

## 📋 Feature Checklist

### Core
- ✅ Multi-tenant organizations
- ✅ Role-based access control
- ✅ Ticket CRUD with bulk operations
- ✅ Real-time messaging
- ✅ File attachments

### Quality
- ✅ SLA policies with breach alerts
- ✅ CSAT surveys
- ✅ Activity logging

### Productivity
- ✅ Canned responses
- ✅ Saved filters
- ✅ Categories & tags
- ✅ Export (CSV/Excel)

### Automation
- ✅ Email notifications
- ✅ Auto-close tickets
- ✅ Daily digests
- ✅ Background jobs

---

<p align="center">
  <strong>InsightDesk</strong> – Customer support that scales with you.
</p>