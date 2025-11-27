# State Management

> Client state patterns for InsightDesk using Zustand and TanStack Query

---

## Table of Contents

- [State Architecture](#state-architecture)
- [Server State (TanStack Query)](#server-state-tanstack-query)
- [Client State (Zustand)](#client-state-zustand)
- [Form State (React Hook Form)](#form-state-react-hook-form)
- [URL State](#url-state)
- [Real-time State](#real-time-state)

---

## State Architecture

### State Categories

```
┌─────────────────────────────────────────────────────────────────┐
│                     Application State                            │
├─────────────────┬─────────────────┬─────────────────────────────┤
│  Server State   │  Client State   │      Ephemeral State        │
│  (TanStack)     │  (Zustand)      │                             │
├─────────────────┼─────────────────┼─────────────────────────────┤
│ • API data      │ • Auth state    │ • Form inputs               │
│ • Cached data   │ • UI preferences│ • Modal open/closed         │
│ • Pagination    │ • Sidebar state │ • Hover states              │
│ • Filters       │ • Theme         │ • Loading states            │
│ • Search        │ • Notifications │ • Error messages            │
└─────────────────┴─────────────────┴─────────────────────────────┘
```

### Choosing State Location

| Question | Yes → | No → |
|----------|-------|------|
| Does it come from the server? | TanStack Query | Continue |
| Is it shared across components? | Zustand | Continue |
| Is it in the URL? | URL state (useSearchParams) | Continue |
| Is it form data? | React Hook Form | Component state |

---

## Server State (TanStack Query)

### Setup

```tsx
// lib/providers/query-provider.tsx
'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { useState } from 'react';

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minute
            gcTime: 5 * 60 * 1000, // 5 minutes
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
```

### Query Hooks

```tsx
// lib/hooks/useTickets.ts
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { Ticket, CreateTicketInput, TicketFilters } from '@/types/tickets';

// Query keys factory
export const ticketKeys = {
  all: ['tickets'] as const,
  lists: () => [...ticketKeys.all, 'list'] as const,
  list: (filters: TicketFilters) => [...ticketKeys.lists(), filters] as const,
  details: () => [...ticketKeys.all, 'detail'] as const,
  detail: (id: string) => [...ticketKeys.details(), id] as const,
};

// List tickets with filters
export function useTickets(filters: TicketFilters) {
  return useQuery({
    queryKey: ticketKeys.list(filters),
    queryFn: () => api.tickets.list(filters),
    placeholderData: (previousData) => previousData,
  });
}

// Infinite scroll tickets
export function useInfiniteTickets(filters: Omit<TicketFilters, 'page'>) {
  return useInfiniteQuery({
    queryKey: ticketKeys.list(filters),
    queryFn: ({ pageParam = 1 }) => api.tickets.list({ ...filters, page: pageParam }),
    getNextPageParam: (lastPage) => 
      lastPage.hasMore ? lastPage.page + 1 : undefined,
    initialPageParam: 1,
  });
}

// Single ticket
export function useTicket(id: string) {
  return useQuery({
    queryKey: ticketKeys.detail(id),
    queryFn: () => api.tickets.get(id),
    enabled: !!id,
  });
}

// Create ticket
export function useCreateTicket() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateTicketInput) => api.tickets.create(input),
    onSuccess: (newTicket) => {
      // Invalidate list queries
      queryClient.invalidateQueries({ queryKey: ticketKeys.lists() });
      
      // Optionally add to cache
      queryClient.setQueryData(ticketKeys.detail(newTicket.id), newTicket);
    },
  });
}

// Update ticket
export function useUpdateTicket() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Ticket> }) =>
      api.tickets.update(id, data),
    onMutate: async ({ id, data }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ticketKeys.detail(id) });

      // Snapshot previous value
      const previousTicket = queryClient.getQueryData(ticketKeys.detail(id));

      // Optimistically update
      queryClient.setQueryData(ticketKeys.detail(id), (old: Ticket) => ({
        ...old,
        ...data,
      }));

      return { previousTicket };
    },
    onError: (err, { id }, context) => {
      // Rollback on error
      if (context?.previousTicket) {
        queryClient.setQueryData(ticketKeys.detail(id), context.previousTicket);
      }
    },
    onSettled: (_, __, { id }) => {
      // Refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: ticketKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: ticketKeys.lists() });
    },
  });
}

// Delete ticket
export function useDeleteTicket() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.tickets.delete(id),
    onSuccess: (_, id) => {
      queryClient.removeQueries({ queryKey: ticketKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: ticketKeys.lists() });
    },
  });
}
```

### Prefetching

```tsx
// app/(dashboard)/tickets/page.tsx
import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query';
import { ticketKeys } from '@/lib/hooks/useTickets';
import { api } from '@/lib/api/client';
import { TicketList } from '@/components/features/tickets/TicketList';

export default async function TicketsPage({
  searchParams,
}: {
  searchParams: { status?: string; page?: string };
}) {
  const queryClient = new QueryClient();

  const filters = {
    status: searchParams.status,
    page: parseInt(searchParams.page || '1'),
  };

  // Prefetch on server
  await queryClient.prefetchQuery({
    queryKey: ticketKeys.list(filters),
    queryFn: () => api.tickets.list(filters),
  });

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <TicketList filters={filters} />
    </HydrationBoundary>
  );
}
```

---

## Client State (Zustand)

### Auth Store

```tsx
// lib/stores/auth.store.ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { User } from '@/types/users';

interface AuthState {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  
  // Actions
  setUser: (user: User) => void;
  setAccessToken: (token: string) => void;
  logout: () => void;
  setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      isLoading: true,

      setUser: (user) => set({ user, isAuthenticated: true, isLoading: false }),
      
      setAccessToken: (token) => set({ accessToken: token }),
      
      logout: () => set({
        user: null,
        accessToken: null,
        isAuthenticated: false,
        isLoading: false,
      }),
      
      setLoading: (isLoading) => set({ isLoading }),
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ user: state.user }), // Only persist user
    }
  )
);

// Selectors
export const useUser = () => useAuthStore((state) => state.user);
export const useIsAuthenticated = () => useAuthStore((state) => state.isAuthenticated);
```

### UI Store

```tsx
// lib/stores/ui.store.ts
import { create } from 'zustand';

interface UIState {
  // Sidebar
  sidebarOpen: boolean;
  sidebarCollapsed: boolean;
  
  // Theme
  theme: 'light' | 'dark' | 'system';
  
  // Command palette
  commandPaletteOpen: boolean;
  
  // Actions
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  toggleCommandPalette: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: true,
  sidebarCollapsed: false,
  theme: 'system',
  commandPaletteOpen: false,

  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  
  setTheme: (theme) => set({ theme }),
  
  toggleCommandPalette: () => set((state) => ({ 
    commandPaletteOpen: !state.commandPaletteOpen 
  })),
}));

// Hooks for specific pieces
export const useSidebarOpen = () => useUIStore((state) => state.sidebarOpen);
export const useTheme = () => useUIStore((state) => state.theme);
```

### Notifications Store

```tsx
// lib/stores/notifications.store.ts
import { create } from 'zustand';
import type { Notification } from '@/types/notifications';

interface NotificationsState {
  notifications: Notification[];
  unreadCount: number;
  
  // Actions
  addNotification: (notification: Notification) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  removeNotification: (id: string) => void;
  setNotifications: (notifications: Notification[]) => void;
  setUnreadCount: (count: number) => void;
}

export const useNotificationsStore = create<NotificationsState>((set) => ({
  notifications: [],
  unreadCount: 0,

  addNotification: (notification) =>
    set((state) => ({
      notifications: [notification, ...state.notifications],
      unreadCount: state.unreadCount + 1,
    })),

  markAsRead: (id) =>
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === id ? { ...n, readAt: new Date() } : n
      ),
      unreadCount: Math.max(0, state.unreadCount - 1),
    })),

  markAllAsRead: () =>
    set((state) => ({
      notifications: state.notifications.map((n) => ({
        ...n,
        readAt: n.readAt || new Date(),
      })),
      unreadCount: 0,
    })),

  removeNotification: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    })),

  setNotifications: (notifications) =>
    set({
      notifications,
      unreadCount: notifications.filter((n) => !n.readAt).length,
    }),

  setUnreadCount: (count) => set({ unreadCount: count }),
}));
```

---

## Form State (React Hook Form)

### Form with Validation

```tsx
// components/features/tickets/CreateTicketForm.tsx
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useCreateTicket } from '@/lib/hooks/useTickets';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';

const createTicketSchema = z.object({
  subject: z
    .string()
    .min(5, 'Subject must be at least 5 characters')
    .max(200, 'Subject must be less than 200 characters'),
  description: z
    .string()
    .min(20, 'Description must be at least 20 characters')
    .max(10000, 'Description must be less than 10000 characters'),
  priority: z.enum(['low', 'medium', 'high', 'urgent']),
  categoryId: z.string().uuid('Please select a category'),
});

type CreateTicketFormData = z.infer<typeof createTicketSchema>;

interface CreateTicketFormProps {
  onSuccess?: () => void;
}

export function CreateTicketForm({ onSuccess }: CreateTicketFormProps) {
  const { mutate, isPending } = useCreateTicket();
  const { toast } = useToast();

  const form = useForm<CreateTicketFormData>({
    resolver: zodResolver(createTicketSchema),
    defaultValues: {
      subject: '',
      description: '',
      priority: 'medium',
      categoryId: '',
    },
  });

  const onSubmit = (data: CreateTicketFormData) => {
    mutate(data, {
      onSuccess: () => {
        toast({
          title: 'Ticket created',
          description: 'Your ticket has been submitted successfully.',
        });
        form.reset();
        onSuccess?.();
      },
      onError: (error) => {
        toast({
          title: 'Error',
          description: error.message,
          variant: 'destructive',
        });
      },
    });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="subject"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Subject</FormLabel>
              <FormControl>
                <Input placeholder="Brief description of the issue" {...field} />
              </FormControl>
              <FormDescription>
                A clear and concise title for your ticket
              </FormDescription>
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
                <Textarea
                  placeholder="Detailed description of the issue..."
                  rows={6}
                  {...field}
                />
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
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select priority" />
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
            name="categoryId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Category</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {/* Categories would be fetched */}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <Button type="submit" disabled={isPending} className="w-full">
          {isPending ? 'Creating...' : 'Create Ticket'}
        </Button>
      </form>
    </Form>
  );
}
```

---

## URL State

### Filter State in URL

```tsx
// lib/hooks/useTicketFilters.ts
'use client';

import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useCallback } from 'react';

interface TicketFilters {
  status?: string;
  priority?: string;
  assignee?: string;
  search?: string;
  page?: number;
}

export function useTicketFilters() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const filters: TicketFilters = {
    status: searchParams.get('status') || undefined,
    priority: searchParams.get('priority') || undefined,
    assignee: searchParams.get('assignee') || undefined,
    search: searchParams.get('search') || undefined,
    page: searchParams.get('page') ? parseInt(searchParams.get('page')!) : 1,
  };

  const setFilters = useCallback(
    (newFilters: Partial<TicketFilters>) => {
      const params = new URLSearchParams(searchParams);

      Object.entries(newFilters).forEach(([key, value]) => {
        if (value === undefined || value === '' || value === null) {
          params.delete(key);
        } else {
          params.set(key, String(value));
        }
      });

      // Reset page when filters change
      if (!('page' in newFilters)) {
        params.delete('page');
      }

      router.push(`${pathname}?${params.toString()}`);
    },
    [searchParams, router, pathname]
  );

  const clearFilters = useCallback(() => {
    router.push(pathname);
  }, [router, pathname]);

  return {
    filters,
    setFilters,
    clearFilters,
    hasFilters: Object.values(filters).some((v) => v !== undefined && v !== 1),
  };
}
```

---

## Real-time State

### WebSocket Integration

```tsx
// lib/hooks/useWebSocket.ts
'use client';

import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '@/lib/stores/auth.store';
import { useNotificationsStore } from '@/lib/stores/notifications.store';
import { useQueryClient } from '@tanstack/react-query';
import { ticketKeys } from './useTickets';

export function useWebSocket() {
  const socketRef = useRef<Socket | null>(null);
  const { accessToken } = useAuthStore();
  const { addNotification, setUnreadCount } = useNotificationsStore();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!accessToken) return;

    const socket = io(process.env.NEXT_PUBLIC_WS_URL!, {
      auth: { token: accessToken },
      transports: ['websocket'],
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('WebSocket connected');
    });

    // Real-time notifications
    socket.on('notification', (notification) => {
      addNotification(notification);
    });

    socket.on('notification:count', ({ unread }) => {
      setUnreadCount(unread);
    });

    // Real-time ticket updates
    socket.on('ticket:updated', (ticket) => {
      queryClient.setQueryData(ticketKeys.detail(ticket.id), ticket);
      queryClient.invalidateQueries({ queryKey: ticketKeys.lists() });
    });

    socket.on('ticket:message', ({ ticketId }) => {
      queryClient.invalidateQueries({ queryKey: ticketKeys.detail(ticketId) });
    });

    return () => {
      socket.disconnect();
    };
  }, [accessToken, addNotification, setUnreadCount, queryClient]);

  const joinTicketRoom = useCallback((ticketId: string) => {
    socketRef.current?.emit('ticket:join', ticketId);
  }, []);

  const leaveTicketRoom = useCallback((ticketId: string) => {
    socketRef.current?.emit('ticket:leave', ticketId);
  }, []);

  const sendTyping = useCallback((ticketId: string) => {
    socketRef.current?.emit('ticket:typing', ticketId);
  }, []);

  return {
    joinTicketRoom,
    leaveTicketRoom,
    sendTyping,
    isConnected: socketRef.current?.connected ?? false,
  };
}
```

### Real-time Ticket Updates

```tsx
// components/features/tickets/TicketMessages.tsx
'use client';

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useWebSocket } from '@/lib/hooks/useWebSocket';
import { api } from '@/lib/api/client';

interface TicketMessagesProps {
  ticketId: string;
}

export function TicketMessages({ ticketId }: TicketMessagesProps) {
  const { joinTicketRoom, leaveTicketRoom } = useWebSocket();

  const { data: messages } = useQuery({
    queryKey: ['tickets', ticketId, 'messages'],
    queryFn: () => api.tickets.messages(ticketId),
    refetchInterval: false, // Rely on WebSocket updates
  });

  useEffect(() => {
    joinTicketRoom(ticketId);
    return () => leaveTicketRoom(ticketId);
  }, [ticketId, joinTicketRoom, leaveTicketRoom]);

  return (
    <div className="space-y-4">
      {messages?.map((message) => (
        <MessageBubble key={message.id} message={message} />
      ))}
    </div>
  );
}
```

---

## Related Documents

- [Frontend Overview](overview.md) — Architecture overview
- [Components](components.md) — Component system
- [Routing](routing.md) — App Router patterns
- [Real-time Module](../04-modules/realtime/overview.md) — WebSocket implementation

---

*Next: [Routing →](routing.md)*
