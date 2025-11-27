# Minimum Viable Product (MVP)

> Core features required for InsightDesk initial release.

## Table of Contents

1. [MVP Definition](#mvp-definition)
2. [Core Features](#core-features)
3. [User Stories](#user-stories)
4. [Technical Requirements](#technical-requirements)
5. [Acceptance Criteria](#acceptance-criteria)
6. [Out of Scope](#out-of-scope)

---

## MVP Definition

### Product Vision

InsightDesk MVP delivers a functional helpdesk system that enables organizations to:
- Receive and manage customer support tickets
- Provide self-service knowledge base
- Track team performance with basic analytics

### Target Users

| Role | Description | MVP Priority |
|------|-------------|--------------|
| Customer | End user submitting support requests | High |
| Agent | Support team member handling tickets | High |
| Admin | Organization administrator | High |
| Manager | Team lead viewing analytics | Medium |

### Success Criteria

- [ ] Support 100 concurrent agents
- [ ] Handle 1,000 tickets/day
- [ ] < 200ms API response time (P95)
- [ ] 99.5% uptime
- [ ] Basic analytics dashboard

---

## Core Features

### 1. Authentication & Authorization

```
Priority: P0 (Must Have)
Effort: 2 weeks
```

**Features:**
- [ ] Email/password registration
- [ ] Email verification
- [ ] Login/logout
- [ ] Password reset flow
- [ ] JWT-based sessions
- [ ] Role-based access control (RBAC)
  - Super Admin
  - Organization Admin
  - Agent
  - Customer

**API Endpoints:**
- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/logout`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/forgot-password`
- `POST /api/v1/auth/reset-password`
- `GET /api/v1/auth/verify-email/:token`

### 2. Organization Management

```
Priority: P0 (Must Have)
Effort: 1 week
```

**Features:**
- [ ] Organization creation on signup
- [ ] Organization settings
- [ ] Team member invitation
- [ ] Member role management
- [ ] Organization branding (name, logo)

**API Endpoints:**
- `GET /api/v1/organizations/:id`
- `PATCH /api/v1/organizations/:id`
- `POST /api/v1/organizations/:id/invitations`
- `GET /api/v1/organizations/:id/members`
- `PATCH /api/v1/organizations/:id/members/:userId`

### 3. Ticket Management

```
Priority: P0 (Must Have)
Effort: 3 weeks
```

**Features:**
- [ ] Create ticket (customer/agent)
- [ ] View ticket details
- [ ] List tickets with filtering
- [ ] Update ticket status
- [ ] Assign/reassign tickets
- [ ] Priority management
- [ ] Add comments (internal/public)
- [ ] Ticket history/timeline
- [ ] Basic email notifications

**Ticket Status Flow:**
```
OPEN → IN_PROGRESS → PENDING → RESOLVED → CLOSED
         ↑                        ↓
         └────── REOPENED ◄───────┘
```

**API Endpoints:**
- `POST /api/v1/tickets`
- `GET /api/v1/tickets`
- `GET /api/v1/tickets/:id`
- `PATCH /api/v1/tickets/:id`
- `DELETE /api/v1/tickets/:id`
- `POST /api/v1/tickets/:id/comments`
- `GET /api/v1/tickets/:id/comments`
- `POST /api/v1/tickets/:id/assign`

### 4. Knowledge Base

```
Priority: P1 (Should Have)
Effort: 2 weeks
```

**Features:**
- [ ] Create/edit articles (rich text)
- [ ] Article categories
- [ ] Draft/published states
- [ ] Public article viewing
- [ ] Category-based navigation
- [ ] Full-text search
- [ ] Article view tracking

**API Endpoints:**
- `POST /api/v1/articles`
- `GET /api/v1/articles`
- `GET /api/v1/articles/:id`
- `PATCH /api/v1/articles/:id`
- `DELETE /api/v1/articles/:id`
- `GET /api/v1/articles/search`
- `GET /api/v1/categories`
- `POST /api/v1/categories`

### 5. Real-time Updates

```
Priority: P1 (Should Have)
Effort: 1.5 weeks
```

**Features:**
- [ ] WebSocket connection
- [ ] Live ticket updates
- [ ] New ticket notifications
- [ ] Assignment notifications
- [ ] Comment notifications
- [ ] Online presence indicators

**WebSocket Events:**
- `ticket:created`
- `ticket:updated`
- `ticket:assigned`
- `comment:created`
- `user:online`
- `user:offline`

### 6. Basic Analytics

```
Priority: P1 (Should Have)
Effort: 1.5 weeks
```

**Features:**
- [ ] Dashboard overview
- [ ] Ticket volume metrics
- [ ] Status distribution
- [ ] Agent workload
- [ ] Response time stats
- [ ] Date range filtering

**API Endpoints:**
- `GET /api/v1/analytics/dashboard`
- `GET /api/v1/analytics/tickets`
- `GET /api/v1/analytics/agents`

---

## User Stories

### Customer Stories

| ID | Story | Acceptance Criteria |
|----|-------|---------------------|
| C1 | As a customer, I want to submit a support ticket | Can fill form, receive confirmation, see ticket ID |
| C2 | As a customer, I want to view my ticket status | Can see ticket list, filter by status |
| C3 | As a customer, I want to reply to ticket updates | Can add comments, receive email notifications |
| C4 | As a customer, I want to search the knowledge base | Can search articles, view results, navigate categories |
| C5 | As a customer, I want to reset my password | Can request reset, receive email, set new password |

### Agent Stories

| ID | Story | Acceptance Criteria |
|----|-------|---------------------|
| A1 | As an agent, I want to view assigned tickets | Can see queue, filter, sort by priority/date |
| A2 | As an agent, I want to update ticket status | Can change status, system logs change |
| A3 | As an agent, I want to add internal notes | Can add private comments agents can see |
| A4 | As an agent, I want to reassign tickets | Can transfer to other agents |
| A5 | As an agent, I want to see ticket history | Can view all changes, comments, assignments |
| A6 | As an agent, I want real-time notifications | Receive alerts for new assignments |

### Admin Stories

| ID | Story | Acceptance Criteria |
|----|-------|---------------------|
| D1 | As an admin, I want to manage team members | Can invite, remove, change roles |
| D2 | As an admin, I want to view team performance | Can see dashboard with key metrics |
| D3 | As an admin, I want to manage knowledge base | Can create/edit/delete articles |
| D4 | As an admin, I want to configure organization | Can update name, logo, settings |

---

## Technical Requirements

### Database Schema (Core Tables)

```prisma
// Core MVP Schema

model User {
  id             String   @id @default(cuid())
  email          String   @unique
  passwordHash   String
  name           String
  role           Role     @default(CUSTOMER)
  emailVerified  Boolean  @default(false)
  createdAt      DateTime @default(now())
  
  organizationId String?
  organization   Organization? @relation(fields: [organizationId], references: [id])
  
  assignedTickets Ticket[] @relation("AssignedTickets")
  createdTickets  Ticket[] @relation("CreatedTickets")
  comments        Comment[]
}

model Organization {
  id        String   @id @default(cuid())
  name      String
  slug      String   @unique
  logo      String?
  createdAt DateTime @default(now())
  
  users     User[]
  tickets   Ticket[]
  articles  Article[]
  categories Category[]
}

model Ticket {
  id          String       @id @default(cuid())
  number      Int          @default(autoincrement())
  title       String
  description String
  status      TicketStatus @default(OPEN)
  priority    Priority     @default(MEDIUM)
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt
  
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id])
  
  createdById String
  createdBy   User @relation("CreatedTickets", fields: [createdById], references: [id])
  
  assigneeId String?
  assignee   User? @relation("AssignedTickets", fields: [assigneeId], references: [id])
  
  comments Comment[]
  
  @@unique([organizationId, number])
}

model Comment {
  id         String   @id @default(cuid())
  content    String
  isInternal Boolean  @default(false)
  createdAt  DateTime @default(now())
  
  ticketId String
  ticket   Ticket @relation(fields: [ticketId], references: [id])
  
  authorId String
  author   User @relation(fields: [authorId], references: [id])
}

model Article {
  id          String        @id @default(cuid())
  title       String
  slug        String        @unique
  content     String
  status      ArticleStatus @default(DRAFT)
  viewCount   Int           @default(0)
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt
  
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id])
  
  categoryId String?
  category   Category? @relation(fields: [categoryId], references: [id])
}

model Category {
  id          String   @id @default(cuid())
  name        String
  slug        String
  description String?
  order       Int      @default(0)
  
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id])
  
  articles Article[]
  
  @@unique([organizationId, slug])
}

enum Role {
  SUPER_ADMIN
  ADMIN
  AGENT
  CUSTOMER
}

enum TicketStatus {
  OPEN
  IN_PROGRESS
  PENDING
  RESOLVED
  CLOSED
}

enum Priority {
  LOW
  MEDIUM
  HIGH
  URGENT
}

enum ArticleStatus {
  DRAFT
  PUBLISHED
  ARCHIVED
}
```

### API Standards

- RESTful design
- JSON:API-inspired responses
- JWT authentication
- Zod validation
- Standard error format
- Request ID tracing

### Frontend Requirements

- Next.js 14+ with App Router
- Responsive design (mobile-first)
- Dark/light mode
- Accessibility (WCAG 2.1 AA)
- Loading states
- Error boundaries

### Infrastructure

- Docker containerization
- PostgreSQL 16
- Valkey (Redis-compatible)
- GitHub Actions CI/CD
- Basic monitoring (health checks)

---

## Acceptance Criteria

### Functional Requirements

| Requirement | Criteria | Status |
|-------------|----------|--------|
| User Registration | Users can register, verify email, login | ⬜ |
| Ticket Creation | Tickets created with all required fields | ⬜ |
| Ticket Updates | Status/assignment changes are logged | ⬜ |
| Comments | Public/internal comments functional | ⬜ |
| Knowledge Base | Articles searchable and viewable | ⬜ |
| Real-time | Updates appear without refresh | ⬜ |
| Analytics | Dashboard shows accurate metrics | ⬜ |

### Non-Functional Requirements

| Requirement | Target | Status |
|-------------|--------|--------|
| API Response Time | P95 < 200ms | ⬜ |
| Page Load Time | < 3s on 3G | ⬜ |
| Uptime | 99.5% | ⬜ |
| Concurrent Users | 100 agents | ⬜ |
| Data Retention | 1 year | ⬜ |
| Browser Support | Chrome, Firefox, Safari, Edge | ⬜ |

### Security Requirements

| Requirement | Criteria | Status |
|-------------|----------|--------|
| Authentication | JWT with refresh tokens | ⬜ |
| Password Security | bcrypt, min 8 chars | ⬜ |
| Authorization | RBAC enforced on all endpoints | ⬜ |
| Input Validation | All inputs validated | ⬜ |
| HTTPS | Enforced in production | ⬜ |
| Rate Limiting | Basic rate limiting | ⬜ |

---

## Out of Scope

The following features are **NOT** included in MVP:

### Authentication
- ❌ Social login (Google, GitHub)
- ❌ SAML/SSO
- ❌ Multi-factor authentication
- ❌ SCIM provisioning

### Ticket Management
- ❌ Automated ticket routing
- ❌ SLA management
- ❌ Macros/canned responses
- ❌ Ticket merging
- ❌ Custom fields
- ❌ Ticket templates

### Communication
- ❌ Email piping (inbound email)
- ❌ Chat widget
- ❌ Phone/voice integration
- ❌ Social media channels

### Automation
- ❌ Workflow automation
- ❌ Scheduled actions
- ❌ Business rules engine
- ❌ Triggers and automations

### AI Features
- ❌ Smart suggestions
- ❌ Sentiment analysis
- ❌ Chatbot
- ❌ Auto-categorization

### Reporting
- ❌ Custom reports
- ❌ Report scheduling
- ❌ Export functionality
- ❌ Advanced analytics

### Enterprise
- ❌ Custom branding
- ❌ Custom domains
- ❌ White labeling
- ❌ Audit logging
- ❌ API access control

### Integrations
- ❌ Third-party integrations
- ❌ Webhooks
- ❌ API tokens
- ❌ Zapier/Make integration

---

## MVP Timeline

```
Week 1-2: Foundation
├── Project setup
├── Database schema
├── Authentication system
└── CI/CD pipeline

Week 3-4: Ticket System
├── Ticket CRUD
├── Comments
├── Assignment
└── Status workflow

Week 5-6: Knowledge Base
├── Article management
├── Categories
├── Search
└── Public portal

Week 7-8: Real-time & Polish
├── WebSocket integration
├── Live updates
├── Basic analytics
└── Bug fixes & testing

Week 9-10: Launch Prep
├── Performance testing
├── Security audit
├── Documentation
└── Production deployment
```

**Total MVP Duration: 10 weeks**
