# Frontend Documentation

> Next.js frontend architecture for InsightDesk

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Project Structure](#project-structure)
- [Technology Stack](#technology-stack)
- [Key Patterns](#key-patterns)
- [Development Workflow](#development-workflow)

---

## Architecture Overview

### Core Principles

1. **Server-First** — RSC for data fetching, minimal client JS
2. **Type Safety** — End-to-end TypeScript with Zod validation
3. **Accessibility** — WCAG 2.1 AA compliance
4. **Performance** — Core Web Vitals optimization
5. **Maintainability** — Feature-based organization

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Browser                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Next.js App Router                            │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │  Server         │  │  Client         │  │  API Routes     │  │
│  │  Components     │  │  Components     │  │  (BFF)          │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                  ┌───────────┴───────────┐
                  ▼                       ▼
┌──────────────────────────┐  ┌──────────────────────────────────┐
│     Express API          │  │     External Services            │
│     (Backend)            │  │     (Resend, Storage, etc.)      │
└──────────────────────────┘  └──────────────────────────────────┘
```

---

## Project Structure

```
apps/web/
├── app/                          # App Router
│   ├── (auth)/                   # Auth route group
│   │   ├── login/
│   │   ├── register/
│   │   └── forgot-password/
│   ├── (dashboard)/              # Protected routes
│   │   ├── layout.tsx            # Dashboard layout
│   │   ├── page.tsx              # Dashboard home
│   │   ├── tickets/
│   │   │   ├── page.tsx          # Ticket list
│   │   │   ├── [id]/
│   │   │   │   ├── page.tsx      # Ticket detail
│   │   │   │   └── loading.tsx
│   │   │   └── new/
│   │   ├── knowledge-base/
│   │   ├── analytics/
│   │   └── settings/
│   ├── api/                      # API routes (BFF)
│   │   ├── auth/
│   │   └── webhooks/
│   ├── layout.tsx                # Root layout
│   ├── loading.tsx               # Global loading
│   ├── error.tsx                 # Error boundary
│   ├── not-found.tsx             # 404 page
│   └── globals.css               # Global styles
├── components/
│   ├── ui/                       # Shadcn/ui components
│   │   ├── button.tsx
│   │   ├── input.tsx
│   │   ├── dialog.tsx
│   │   └── ...
│   ├── features/                 # Feature components
│   │   ├── tickets/
│   │   │   ├── TicketCard.tsx
│   │   │   ├── TicketList.tsx
│   │   │   ├── TicketDetail.tsx
│   │   │   └── TicketFilters.tsx
│   │   ├── knowledge-base/
│   │   └── analytics/
│   ├── layout/                   # Layout components
│   │   ├── Sidebar.tsx
│   │   ├── Header.tsx
│   │   ├── Navigation.tsx
│   │   └── UserMenu.tsx
│   └── shared/                   # Shared components
│       ├── Avatar.tsx
│       ├── Badge.tsx
│       ├── DataTable.tsx
│       └── RichTextEditor.tsx
├── lib/
│   ├── api/                      # API client
│   │   ├── client.ts
│   │   ├── tickets.ts
│   │   └── users.ts
│   ├── hooks/                    # Custom hooks
│   │   ├── useTickets.ts
│   │   ├── useAuth.ts
│   │   └── useWebSocket.ts
│   ├── stores/                   # Zustand stores
│   │   ├── auth.store.ts
│   │   ├── ui.store.ts
│   │   └── notifications.store.ts
│   ├── utils/                    # Utilities
│   │   ├── cn.ts
│   │   ├── format.ts
│   │   └── validation.ts
│   └── config.ts                 # App configuration
├── styles/
│   └── themes/
├── types/
│   ├── api.ts
│   ├── tickets.ts
│   └── users.ts
├── middleware.ts                 # Next.js middleware
├── next.config.js
├── tailwind.config.js
└── tsconfig.json
```

---

## Technology Stack

### Core Framework

| Technology | Purpose |
|------------|---------|
| **Next.js 14** | React framework with App Router |
| **React 18** | UI library with Server Components |
| **TypeScript** | Type safety |
| **Tailwind CSS** | Utility-first styling |

### UI Components

| Library | Purpose |
|---------|---------|
| **Shadcn/ui** | Accessible component primitives |
| **Radix UI** | Headless UI components |
| **Lucide React** | Icon library |
| **Framer Motion** | Animations |

### State Management

| Library | Purpose |
|---------|---------|
| **Zustand** | Client state management |
| **TanStack Query** | Server state & caching |
| **React Hook Form** | Form handling |
| **Zod** | Schema validation |

### Real-time & Communication

| Library | Purpose |
|---------|---------|
| **Socket.IO Client** | WebSocket connection |
| **SWR** | Data fetching with revalidation |

---

## Key Patterns

### Server Components (Default)

```tsx
// app/(dashboard)/tickets/page.tsx
import { getTickets } from '@/lib/api/tickets';
import { TicketList } from '@/components/features/tickets/TicketList';

// Server Component - no "use client" directive
export default async function TicketsPage({
  searchParams,
}: {
  searchParams: { status?: string; page?: string };
}) {
  // Fetch data on server
  const tickets = await getTickets({
    status: searchParams.status,
    page: parseInt(searchParams.page || '1'),
  });

  return (
    <div className="container py-6">
      <h1 className="text-2xl font-bold mb-6">Tickets</h1>
      <TicketList tickets={tickets} />
    </div>
  );
}
```

### Client Components (Interactive)

```tsx
// components/features/tickets/TicketFilters.tsx
'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Select } from '@/components/ui/select';

export function TicketFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const updateFilter = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams);
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    router.push(`?${params.toString()}`);
  };

  return (
    <div className="flex gap-4">
      <Select
        value={searchParams.get('status') || ''}
        onValueChange={(v) => updateFilter('status', v)}
      >
        <SelectTrigger>
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="open">Open</SelectItem>
          <SelectItem value="pending">Pending</SelectItem>
          <SelectItem value="resolved">Resolved</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
```

### Data Fetching with TanStack Query

```tsx
// lib/hooks/useTickets.ts
'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';

export function useTickets(filters: TicketFilters) {
  return useQuery({
    queryKey: ['tickets', filters],
    queryFn: () => api.tickets.list(filters),
    staleTime: 30 * 1000, // 30 seconds
  });
}

export function useCreateTicket() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: api.tickets.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
    },
  });
}
```

### Form Handling

```tsx
// components/features/tickets/CreateTicketForm.tsx
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createTicketSchema, type CreateTicketInput } from '@/lib/validation/tickets';

export function CreateTicketForm() {
  const { mutate, isPending } = useCreateTicket();
  
  const form = useForm<CreateTicketInput>({
    resolver: zodResolver(createTicketSchema),
    defaultValues: {
      subject: '',
      description: '',
      priority: 'medium',
    },
  });

  const onSubmit = (data: CreateTicketInput) => {
    mutate(data);
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      <FormField
        control={form.control}
        name="subject"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Subject</FormLabel>
            <FormControl>
              <Input {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      {/* More fields... */}
      <Button type="submit" disabled={isPending}>
        {isPending ? 'Creating...' : 'Create Ticket'}
      </Button>
    </form>
  );
}
```

---

## Development Workflow

### Getting Started

```bash
# Install dependencies
cd apps/web
bun install

# Start development server
bun dev

# Build for production
bun build

# Run production server
bun start
```

### Environment Variables

```env
# .env.local
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_WS_URL=ws://localhost:3001
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Code Quality

```bash
# Type checking
bun typecheck

# Linting
bun lint

# Format code
bun format

# Run tests
bun test
```

---

## Section Documents

| Document | Description |
|----------|-------------|
| [Components](components.md) | UI component system |
| [State Management](state-management.md) | Client state patterns |
| [Routing](routing.md) | App Router conventions |
| [Accessibility](accessibility.md) | WCAG compliance |

---

*Next: [Components →](components.md)*
