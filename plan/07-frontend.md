# Frontend Architecture

> Next.js 16 + React 19.2 patterns for solo developers

## Table of Contents

1. [Project Structure](#project-structure)
2. [App Router Setup](#app-router-setup)
3. [React 19 Features](#react-19-features)
4. [Component Architecture](#component-architecture)
5. [State Management](#state-management)
6. [Data Fetching](#data-fetching)
7. [Forms & Validation](#forms--validation)
8. [UI Components](#ui-components)

---

## Project Structure

```
apps/web/
├── app/                          # Next.js App Router
│   ├── (auth)/                   # Auth route group
│   │   ├── login/page.tsx
│   │   ├── register/page.tsx
│   │   └── layout.tsx
│   ├── (dashboard)/              # Protected dashboard
│   │   ├── tickets/
│   │   │   ├── page.tsx          # Ticket list
│   │   │   ├── [id]/page.tsx     # Ticket detail
│   │   │   └── new/page.tsx      # Create ticket
│   │   ├── settings/page.tsx
│   │   └── layout.tsx
│   ├── (portal)/                 # Customer portal
│   │   ├── my-tickets/page.tsx
│   │   └── layout.tsx
│   ├── api/                      # API routes (minimal, proxy to Express)
│   │   └── auth/[...all]/route.ts
│   ├── layout.tsx                # Root layout
│   ├── page.tsx                  # Landing page
│   └── globals.css
├── components/
│   ├── ui/                       # shadcn/ui components
│   ├── tickets/                  # Ticket-specific components
│   ├── chat/                     # Chat components
│   └── shared/                   # Shared components
├── hooks/                        # Custom React hooks
├── lib/                          # Utilities
│   ├── api.ts                    # API client
│   ├── socket.ts                 # Socket.IO client
│   └── utils.ts
├── stores/                       # Zustand stores
├── types/                        # TypeScript types
└── package.json
```

---

## App Router Setup

### Root Layout

```tsx
// app/layout.tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "InsightDesk",
  description: "Customer Support Platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

### Providers Wrapper

```tsx
// components/providers.tsx
"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { useState } from "react";

export function Providers({ children }: { children: React.ReactNode }) {
  // Create QueryClient inside component to avoid sharing between requests
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minute
            retry: 1,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        {children}
        <Toaster />
      </ThemeProvider>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
```

### Dashboard Layout (Protected)

```tsx
// app/(dashboard)/layout.tsx
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { Sidebar } from "@/components/shared/sidebar";
import { Header } from "@/components/shared/header";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  // Only agents and admins can access dashboard
  if (session.user.role === "customer") {
    redirect("/my-tickets");
  }

  return (
    <div className="flex h-screen">
      <Sidebar user={session.user} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header user={session.user} />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
```

### Route Groups Explained

```
(auth)      → Public routes, minimal layout
(dashboard) → Protected, full dashboard UI
(portal)    → Customer-only portal with simple layout
```

---

## React 19 Features

### Server Components (Default)

```tsx
// app/(dashboard)/tickets/page.tsx
// This is a Server Component by default - no "use client"

import { getTickets } from "@/lib/api/tickets";
import { TicketList } from "@/components/tickets/ticket-list";
import { TicketFilters } from "@/components/tickets/ticket-filters";

interface SearchParams {
  status?: string;
  priority?: string;
  page?: string;
}

export default async function TicketsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  
  // Fetch on the server - no loading states needed
  const tickets = await getTickets({
    status: params.status,
    priority: params.priority,
    page: Number(params.page) || 1,
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Tickets</h1>
        <TicketFilters />
      </div>
      <TicketList tickets={tickets.data} pagination={tickets.pagination} />
    </div>
  );
}
```

### use() Hook for Promises

```tsx
// React 19's use() hook for promises
"use client";

import { use } from "react";

interface TicketDetailProps {
  ticketPromise: Promise<Ticket>;
}

export function TicketDetail({ ticketPromise }: TicketDetailProps) {
  // Suspense-compatible promise unwrapping
  const ticket = use(ticketPromise);

  return (
    <div className="p-6 border rounded-lg">
      <h2 className="text-xl font-semibold">{ticket.subject}</h2>
      <p className="text-muted-foreground mt-2">{ticket.description}</p>
    </div>
  );
}
```

### Actions (Server Actions)

```tsx
// app/(dashboard)/tickets/new/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { api } from "@/lib/api";

const createTicketSchema = z.object({
  subject: z.string().min(5).max(200),
  description: z.string().min(10),
  priority: z.enum(["low", "medium", "high", "urgent"]),
  categoryId: z.string().uuid().optional(),
});

export async function createTicket(formData: FormData) {
  const rawData = {
    subject: formData.get("subject"),
    description: formData.get("description"),
    priority: formData.get("priority"),
    categoryId: formData.get("categoryId"),
  };

  const validated = createTicketSchema.parse(rawData);

  const response = await api.post("/api/v1/tickets", validated);

  if (!response.ok) {
    return { error: "Failed to create ticket" };
  }

  revalidatePath("/tickets");
  redirect("/tickets");
}
```

### useActionState (React 19)

```tsx
// components/tickets/create-ticket-form.tsx
"use client";

import { useActionState } from "react";
import { createTicket } from "@/app/(dashboard)/tickets/new/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function CreateTicketForm() {
  const [state, action, isPending] = useActionState(createTicket, null);

  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="subject" className="text-sm font-medium">
          Subject
        </label>
        <Input
          id="subject"
          name="subject"
          placeholder="Brief description of your issue"
          required
        />
      </div>

      <div>
        <label htmlFor="description" className="text-sm font-medium">
          Description
        </label>
        <Textarea
          id="description"
          name="description"
          placeholder="Provide more details..."
          rows={5}
          required
        />
      </div>

      <div>
        <label htmlFor="priority" className="text-sm font-medium">
          Priority
        </label>
        <Select name="priority" defaultValue="medium">
          <SelectTrigger>
            <SelectValue placeholder="Select priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="low">Low</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="urgent">Urgent</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {state?.error && (
        <p className="text-sm text-destructive">{state.error}</p>
      )}

      <Button type="submit" disabled={isPending}>
        {isPending ? "Creating..." : "Create Ticket"}
      </Button>
    </form>
  );
}
```

### useOptimistic (React 19)

```tsx
// components/tickets/ticket-status-toggle.tsx
"use client";

import { useOptimistic, useTransition } from "react";
import { updateTicketStatus } from "@/app/(dashboard)/tickets/actions";
import { Badge } from "@/components/ui/badge";

interface TicketStatusToggleProps {
  ticketId: string;
  currentStatus: string;
}

export function TicketStatusToggle({
  ticketId,
  currentStatus,
}: TicketStatusToggleProps) {
  const [isPending, startTransition] = useTransition();
  const [optimisticStatus, setOptimisticStatus] = useOptimistic(currentStatus);

  const handleStatusChange = async (newStatus: string) => {
    startTransition(async () => {
      // Update UI immediately
      setOptimisticStatus(newStatus);
      // Then perform actual update
      await updateTicketStatus(ticketId, newStatus);
    });
  };

  const statusColors = {
    open: "bg-blue-100 text-blue-800",
    in_progress: "bg-yellow-100 text-yellow-800",
    resolved: "bg-green-100 text-green-800",
    closed: "bg-gray-100 text-gray-800",
  };

  return (
    <div className="flex gap-2">
      {["open", "in_progress", "resolved", "closed"].map((status) => (
        <Badge
          key={status}
          className={`cursor-pointer ${
            optimisticStatus === status
              ? statusColors[status as keyof typeof statusColors]
              : "bg-muted"
          } ${isPending ? "opacity-50" : ""}`}
          onClick={() => handleStatusChange(status)}
        >
          {status.replace("_", " ")}
        </Badge>
      ))}
    </div>
  );
}
```

---

## Component Architecture

### Component File Structure

```tsx
// components/tickets/ticket-card.tsx
import { formatDistanceToNow } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { Ticket } from "@/types";

interface TicketCardProps {
  ticket: Ticket;
  onClick?: () => void;
}

export function TicketCard({ ticket, onClick }: TicketCardProps) {
  const priorityColors = {
    low: "bg-slate-100 text-slate-700",
    medium: "bg-blue-100 text-blue-700",
    high: "bg-orange-100 text-orange-700",
    urgent: "bg-red-100 text-red-700",
  };

  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow"
      onClick={onClick}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <CardTitle className="text-base font-medium line-clamp-1">
            {ticket.subject}
          </CardTitle>
          <Badge className={priorityColors[ticket.priority]}>
            {ticket.priority}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground line-clamp-2 mb-4">
          {ticket.description}
        </p>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <Avatar className="h-5 w-5">
              <AvatarImage src={ticket.customer?.avatarUrl} />
              <AvatarFallback>
                {ticket.customer?.name?.charAt(0) ?? "?"}
              </AvatarFallback>
            </Avatar>
            <span>{ticket.customer?.name}</span>
          </div>
          <time>
            {formatDistanceToNow(new Date(ticket.createdAt), {
              addSuffix: true,
            })}
          </time>
        </div>
      </CardContent>
    </Card>
  );
}
```

### Compound Components Pattern

```tsx
// components/tickets/ticket-list.tsx
"use client";

import { useRouter } from "next/navigation";
import { TicketCard } from "./ticket-card";
import { Pagination } from "@/components/shared/pagination";
import type { Ticket, PaginationInfo } from "@/types";

interface TicketListProps {
  tickets: Ticket[];
  pagination: PaginationInfo;
}

export function TicketList({ tickets, pagination }: TicketListProps) {
  const router = useRouter();

  if (tickets.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">No tickets found</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {tickets.map((ticket) => (
          <TicketCard
            key={ticket.id}
            ticket={ticket}
            onClick={() => router.push(`/tickets/${ticket.id}`)}
          />
        ))}
      </div>
      <Pagination {...pagination} />
    </div>
  );
}
```

---

## State Management

### Zustand Store Setup

```ts
// stores/ticket-store.ts
import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type { Ticket } from "@/types";

interface TicketFilters {
  status?: string;
  priority?: string;
  assigneeId?: string;
  search?: string;
}

interface TicketState {
  // State
  selectedTicketId: string | null;
  filters: TicketFilters;
  isFilterPanelOpen: boolean;

  // Actions
  selectTicket: (id: string | null) => void;
  setFilters: (filters: Partial<TicketFilters>) => void;
  resetFilters: () => void;
  toggleFilterPanel: () => void;
}

const initialFilters: TicketFilters = {
  status: undefined,
  priority: undefined,
  assigneeId: undefined,
  search: undefined,
};

export const useTicketStore = create<TicketState>()(
  devtools(
    (set) => ({
      // Initial state
      selectedTicketId: null,
      filters: initialFilters,
      isFilterPanelOpen: false,

      // Actions
      selectTicket: (id) => set({ selectedTicketId: id }),

      setFilters: (newFilters) =>
        set((state) => ({
          filters: { ...state.filters, ...newFilters },
        })),

      resetFilters: () => set({ filters: initialFilters }),

      toggleFilterPanel: () =>
        set((state) => ({ isFilterPanelOpen: !state.isFilterPanelOpen })),
    }),
    { name: "ticket-store" }
  )
);
```

### Auth Store

```ts
// stores/auth-store.ts
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { User } from "@/types";

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  setUser: (user: User | null) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,

      setUser: (user) =>
        set({
          user,
          isAuthenticated: !!user,
        }),

      logout: () =>
        set({
          user: null,
          isAuthenticated: false,
        }),
    }),
    {
      name: "auth-storage",
      partialize: (state) => ({ user: state.user }), // Only persist user
    }
  )
);
```

### Socket Store for Real-time

```ts
// stores/socket-store.ts
import { create } from "zustand";
import type { Socket } from "socket.io-client";

interface SocketState {
  socket: Socket | null;
  isConnected: boolean;
  onlineUsers: Set<string>;

  setSocket: (socket: Socket | null) => void;
  setConnected: (connected: boolean) => void;
  addOnlineUser: (userId: string) => void;
  removeOnlineUser: (userId: string) => void;
}

export const useSocketStore = create<SocketState>((set) => ({
  socket: null,
  isConnected: false,
  onlineUsers: new Set(),

  setSocket: (socket) => set({ socket }),
  setConnected: (isConnected) => set({ isConnected }),

  addOnlineUser: (userId) =>
    set((state) => ({
      onlineUsers: new Set([...state.onlineUsers, userId]),
    })),

  removeOnlineUser: (userId) =>
    set((state) => {
      const newSet = new Set(state.onlineUsers);
      newSet.delete(userId);
      return { onlineUsers: newSet };
    }),
}));
```

---

## Data Fetching

### API Client Setup

```ts
// lib/api.ts
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

interface FetchOptions extends RequestInit {
  params?: Record<string, string | number | undefined>;
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    endpoint: string,
    options: FetchOptions = {}
  ): Promise<T> {
    const { params, ...fetchOptions } = options;

    // Build URL with query params
    const url = new URL(`${this.baseUrl}${endpoint}`);
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          url.searchParams.append(key, String(value));
        }
      });
    }

    const response = await fetch(url.toString(), {
      ...fetchOptions,
      headers: {
        "Content-Type": "application/json",
        ...fetchOptions.headers,
      },
      credentials: "include", // For cookies
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new ApiError(response.status, error.message || "Request failed");
    }

    return response.json();
  }

  get<T>(endpoint: string, options?: FetchOptions) {
    return this.request<T>(endpoint, { ...options, method: "GET" });
  }

  post<T>(endpoint: string, data?: unknown, options?: FetchOptions) {
    return this.request<T>(endpoint, {
      ...options,
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  patch<T>(endpoint: string, data?: unknown, options?: FetchOptions) {
    return this.request<T>(endpoint, {
      ...options,
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  delete<T>(endpoint: string, options?: FetchOptions) {
    return this.request<T>(endpoint, { ...options, method: "DELETE" });
  }
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

export const api = new ApiClient(API_URL);
```

### TanStack Query Hooks

```ts
// hooks/use-tickets.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { useTicketStore } from "@/stores/ticket-store";
import type { Ticket, CreateTicketInput, UpdateTicketInput } from "@/types";

// Query keys factory
export const ticketKeys = {
  all: ["tickets"] as const,
  lists: () => [...ticketKeys.all, "list"] as const,
  list: (filters: Record<string, unknown>) =>
    [...ticketKeys.lists(), filters] as const,
  details: () => [...ticketKeys.all, "detail"] as const,
  detail: (id: string) => [...ticketKeys.details(), id] as const,
};

// Fetch tickets with filters
export function useTickets() {
  const filters = useTicketStore((state) => state.filters);

  return useQuery({
    queryKey: ticketKeys.list(filters),
    queryFn: () =>
      api.get<{ data: Ticket[]; pagination: PaginationInfo }>(
        "/api/v1/tickets",
        { params: filters }
      ),
  });
}

// Fetch single ticket
export function useTicket(id: string) {
  return useQuery({
    queryKey: ticketKeys.detail(id),
    queryFn: () => api.get<Ticket>(`/api/v1/tickets/${id}`),
    enabled: !!id,
  });
}

// Create ticket mutation
export function useCreateTicket() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateTicketInput) =>
      api.post<Ticket>("/api/v1/tickets", data),

    onSuccess: () => {
      // Invalidate ticket lists to refetch
      queryClient.invalidateQueries({ queryKey: ticketKeys.lists() });
    },
  });
}

// Update ticket mutation
export function useUpdateTicket() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateTicketInput }) =>
      api.patch<Ticket>(`/api/v1/tickets/${id}`, data),

    onSuccess: (updatedTicket) => {
      // Update specific ticket in cache
      queryClient.setQueryData(
        ticketKeys.detail(updatedTicket.id),
        updatedTicket
      );
      // Invalidate lists
      queryClient.invalidateQueries({ queryKey: ticketKeys.lists() });
    },
  });
}

// Delete ticket mutation
export function useDeleteTicket() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/tickets/${id}`),

    onSuccess: (_, deletedId) => {
      // Remove from cache
      queryClient.removeQueries({ queryKey: ticketKeys.detail(deletedId) });
      queryClient.invalidateQueries({ queryKey: ticketKeys.lists() });
    },
  });
}
```

### Using Queries in Components

```tsx
// components/tickets/ticket-detail-view.tsx
"use client";

import { useTicket, useUpdateTicket } from "@/hooks/use-tickets";
import { useMessages } from "@/hooks/use-messages";
import { TicketHeader } from "./ticket-header";
import { MessageList } from "../chat/message-list";
import { MessageInput } from "../chat/message-input";
import { Skeleton } from "@/components/ui/skeleton";

interface TicketDetailViewProps {
  ticketId: string;
}

export function TicketDetailView({ ticketId }: TicketDetailViewProps) {
  const { data: ticket, isLoading, error } = useTicket(ticketId);
  const { data: messages } = useMessages(ticketId);
  const updateTicket = useUpdateTicket();

  if (isLoading) {
    return <TicketDetailSkeleton />;
  }

  if (error || !ticket) {
    return (
      <div className="p-6 text-center">
        <p className="text-destructive">Failed to load ticket</p>
      </div>
    );
  }

  const handleStatusChange = async (status: string) => {
    await updateTicket.mutateAsync({
      id: ticketId,
      data: { status },
    });
  };

  return (
    <div className="flex flex-col h-full">
      <TicketHeader ticket={ticket} onStatusChange={handleStatusChange} />
      <div className="flex-1 overflow-hidden flex flex-col">
        <MessageList messages={messages?.data ?? []} />
        <MessageInput ticketId={ticketId} />
      </div>
    </div>
  );
}

function TicketDetailSkeleton() {
  return (
    <div className="p-6 space-y-4">
      <Skeleton className="h-8 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}
```

---

## Forms & Validation

### Zod Schemas (Shared with Backend)

```ts
// packages/shared/src/schemas/ticket.ts
import { z } from "zod";

export const createTicketSchema = z.object({
  subject: z
    .string()
    .min(5, "Subject must be at least 5 characters")
    .max(200, "Subject must be less than 200 characters"),
  description: z
    .string()
    .min(10, "Description must be at least 10 characters"),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  categoryId: z.string().uuid().optional(),
});

export const updateTicketSchema = createTicketSchema.partial().extend({
  status: z.enum(["open", "in_progress", "pending", "resolved", "closed"]).optional(),
  assigneeId: z.string().uuid().nullable().optional(),
});

export type CreateTicketInput = z.infer<typeof createTicketSchema>;
export type UpdateTicketInput = z.infer<typeof updateTicketSchema>;
```

### React Hook Form + Zod

```tsx
// components/tickets/edit-ticket-form.tsx
"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { updateTicketSchema, type UpdateTicketInput } from "@shared/schemas/ticket";
import { useUpdateTicket } from "@/hooks/use-tickets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import type { Ticket } from "@/types";

interface EditTicketFormProps {
  ticket: Ticket;
  onSuccess?: () => void;
}

export function EditTicketForm({ ticket, onSuccess }: EditTicketFormProps) {
  const updateTicket = useUpdateTicket();

  const form = useForm<UpdateTicketInput>({
    resolver: zodResolver(updateTicketSchema),
    defaultValues: {
      subject: ticket.subject,
      description: ticket.description,
      priority: ticket.priority,
      status: ticket.status,
    },
  });

  const onSubmit = async (data: UpdateTicketInput) => {
    try {
      await updateTicket.mutateAsync({ id: ticket.id, data });
      toast.success("Ticket updated successfully");
      onSuccess?.();
    } catch (error) {
      toast.error("Failed to update ticket");
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Textarea {...field} rows={5} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="priority"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Priority</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="status"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Status</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="resolved">Resolved</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => form.reset()}
          >
            Reset
          </Button>
          <Button type="submit" disabled={updateTicket.isPending}>
            {updateTicket.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
```

---

## UI Components

### shadcn/ui Setup

```bash
# Initialize shadcn/ui (already done)
bunx shadcn@latest init

# Add components as needed
bunx shadcn@latest add button card input textarea select badge avatar dialog dropdown-menu form toast
```

### Custom Component: Status Badge

```tsx
// components/ui/status-badge.tsx
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Status = "open" | "in_progress" | "pending" | "resolved" | "closed";

const statusConfig: Record<Status, { label: string; className: string }> = {
  open: {
    label: "Open",
    className: "bg-blue-100 text-blue-800 hover:bg-blue-100",
  },
  in_progress: {
    label: "In Progress",
    className: "bg-yellow-100 text-yellow-800 hover:bg-yellow-100",
  },
  pending: {
    label: "Pending",
    className: "bg-purple-100 text-purple-800 hover:bg-purple-100",
  },
  resolved: {
    label: "Resolved",
    className: "bg-green-100 text-green-800 hover:bg-green-100",
  },
  closed: {
    label: "Closed",
    className: "bg-gray-100 text-gray-800 hover:bg-gray-100",
  },
};

interface StatusBadgeProps {
  status: Status;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status];

  return (
    <Badge variant="secondary" className={cn(config.className, className)}>
      {config.label}
    </Badge>
  );
}
```

### Custom Component: Loading States

```tsx
// components/shared/loading.tsx
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeClasses = {
  sm: "h-4 w-4",
  md: "h-6 w-6",
  lg: "h-8 w-8",
};

export function LoadingSpinner({
  size = "md",
  className,
}: LoadingSpinnerProps) {
  return (
    <Loader2
      className={cn("animate-spin text-muted-foreground", sizeClasses[size], className)}
    />
  );
}

export function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <LoadingSpinner size="lg" />
    </div>
  );
}

export function InlineLoader({ text = "Loading..." }: { text?: string }) {
  return (
    <div className="flex items-center gap-2 text-muted-foreground">
      <LoadingSpinner size="sm" />
      <span className="text-sm">{text}</span>
    </div>
  );
}
```

### Responsive Sidebar

```tsx
// components/shared/sidebar.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Ticket,
  Users,
  Settings,
  BarChart,
  Home,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { User } from "@/types";

interface SidebarProps {
  user: User;
}

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: Home },
  { name: "Tickets", href: "/tickets", icon: Ticket },
  { name: "Customers", href: "/customers", icon: Users, adminOnly: true },
  { name: "Reports", href: "/reports", icon: BarChart, adminOnly: true },
  { name: "Settings", href: "/settings", icon: Settings },
];

export function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname();

  const filteredNav = navigation.filter(
    (item) => !item.adminOnly || user.role === "admin"
  );

  return (
    <aside className="hidden md:flex md:w-64 md:flex-col border-r bg-muted/30">
      <div className="flex flex-col flex-1 overflow-y-auto">
        {/* Logo */}
        <div className="flex items-center h-16 px-4 border-b">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <span className="text-primary-foreground font-bold">ID</span>
            </div>
            <span className="font-semibold">InsightDesk</span>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-2 py-4 space-y-1">
          {filteredNav.map((item) => {
            const isActive = pathname.startsWith(item.href);
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <item.icon className="h-5 w-5" />
                {item.name}
              </Link>
            );
          })}
        </nav>

        {/* User */}
        <div className="p-4 border-t">
          <div className="flex items-center gap-3">
            <Avatar className="h-9 w-9">
              <AvatarImage src={user.avatarUrl} />
              <AvatarFallback>
                {user.name?.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user.name}</p>
              <p className="text-xs text-muted-foreground truncate">
                {user.email}
              </p>
            </div>
            <Button variant="ghost" size="icon" asChild>
              <Link href="/api/auth/logout">
                <LogOut className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </aside>
  );
}
```

---

## Key Patterns Summary

| Pattern           | When to Use          | Example             |
| ----------------- | -------------------- | ------------------- |
| Server Components | Data fetching, SEO   | Page components     |
| Client Components | Interactivity, hooks | Forms, modals       |
| Server Actions    | Form submissions     | Create/update data  |
| TanStack Query    | Client-side data     | Polling, mutations  |
| Zustand           | UI state             | Filters, selections |
| `useOptimistic`   | Instant feedback     | Status toggles      |
| `useActionState`  | Form state           | Submit buttons      |

---

## Next Steps

- **08-auth-security.md** - Better Auth implementation
- **09-realtime.md** - Socket.IO integration

---

*Solo Developer Note: Start with server components by default. Only add "use client" when you need interactivity. This keeps your bundle small and improves performance.*
