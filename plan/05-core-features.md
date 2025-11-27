# 05 - Core Features

> **MVP feature specifications for a solo developer**

---

## 🎯 Feature Scope Philosophy

As a solo developer, you must be ruthless about scope. This document defines the **Minimum Viable Product (MVP)** - features that provide real value without over-engineering.

### The 80/20 Rule

```
┌─────────────────────────────────────────────────────────────┐
│                     Feature Value                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ████████████████████████████████████████  MVP (80% value)  │
│  ░░░░░░░░░░  Nice-to-have (20% value, 80% effort)          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### What's In vs Out

| ✅ MVP (Build This)  | ❌ Phase 2+ (Skip for Now)     |
| ------------------- | ----------------------------- |
| Email/password auth | Social login (Google, GitHub) |
| Basic ticket CRUD   | Ticket merging/splitting      |
| Simple SLA tracking | Complex business hours SLA    |
| Real-time updates   | Push notifications            |
| Agent assignment    | Auto-assignment rules         |
| Basic dashboard     | Advanced analytics            |
| Canned responses    | AI-suggested responses        |
| Email notifications | SMS notifications             |
| Single organization | Multi-tenant billing          |

---

## 👤 User Roles

### Role Hierarchy

```
┌─────────────────────────────────────────────────────────────┐
│                        Owner                                 │
│   • Full system access                                       │
│   • Billing management                                       │
│   • Can delete organization                                  │
├─────────────────────────────────────────────────────────────┤
│                        Admin                                 │
│   • Manage team members                                      │
│   • Configure SLA & settings                                 │
│   • Access all tickets                                       │
├─────────────────────────────────────────────────────────────┤
│                        Agent                                 │
│   • Handle assigned tickets                                  │
│   • View all org tickets                                     │
│   • Use canned responses                                     │
├─────────────────────────────────────────────────────────────┤
│                       Customer                               │
│   • Create tickets                                           │
│   • View own tickets only                                    │
│   • Receive updates                                          │
└─────────────────────────────────────────────────────────────┘
```

### Role Permissions Matrix

```typescript
// backend/src/config/permissions.ts
export const permissions = {
  tickets: {
    create: ['customer', 'agent', 'admin', 'owner'],
    read: {
      own: ['customer', 'agent', 'admin', 'owner'],
      all: ['agent', 'admin', 'owner'],
    },
    update: ['agent', 'admin', 'owner'],
    delete: ['admin', 'owner'],
    assign: ['agent', 'admin', 'owner'],
  },
  users: {
    read: ['agent', 'admin', 'owner'],
    create: ['admin', 'owner'],
    update: ['admin', 'owner'],
    delete: ['owner'],
  },
  settings: {
    read: ['admin', 'owner'],
    update: ['owner'],
  },
  sla: {
    read: ['agent', 'admin', 'owner'],
    update: ['admin', 'owner'],
  },
} as const;
```

---

## 🎫 Ticket Lifecycle

### Status Flow

```
                    ┌─────────────┐
                    │   Customer  │
                    │   submits   │
                    └──────┬──────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                         OPEN                                  │
│  • New ticket awaiting attention                              │
│  • SLA timer starts                                           │
│  • Appears in unassigned queue                                │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           │ Agent picks up / assigned
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                       PENDING                                 │
│  • Agent is working on it                                     │
│  • First response SLA checked                                 │
│  • Customer waiting for response                              │
└────────────┬─────────────────────────────────┬───────────────┘
             │                                 │
             │ Agent provides solution         │ Need more info
             ▼                                 │
┌────────────────────────────┐                 │
│         RESOLVED           │                 │
│  • Solution provided       │                 │
│  • Awaiting confirmation   │◄────────────────┘
│  • Auto-close timer starts │
└────────────┬───────────────┘
             │
             │ Customer confirms / Timer expires
             ▼
┌──────────────────────────────────────────────────────────────┐
│                        CLOSED                                 │
│  • Ticket completed                                           │
│  • Metrics calculated                                         │
│  • Can be reopened if needed                                  │
└──────────────────────────────────────────────────────────────┘
```

### Status Transitions

```typescript
// backend/src/modules/tickets/tickets.constants.ts
export const TICKET_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  open: ['pending', 'resolved', 'closed'],
  pending: ['open', 'resolved', 'closed'],
  resolved: ['open', 'pending', 'closed'],
  closed: ['open'], // Reopen
};

export function canTransition(from: TicketStatus, to: TicketStatus): boolean {
  return TICKET_TRANSITIONS[from]?.includes(to) ?? false;
}
```

---

## 📬 Feature: Customer Portal

### User Stories

| As a Customer | I want to...             | So that...                       |
| ------------- | ------------------------ | -------------------------------- |
|               | Submit a support ticket  | I can get help with my issue     |
|               | View my ticket history   | I can track past issues          |
|               | Reply to ticket messages | I can provide more information   |
|               | See ticket status        | I know when to expect resolution |
|               | Get email notifications  | I'm updated without logging in   |

### Customer Portal Pages

```
/portal
├── /                    → Dashboard (recent tickets, quick submit)
├── /tickets            → List all my tickets
├── /tickets/new        → Create new ticket
├── /tickets/[id]       → View ticket details + conversation
└── /settings           → Email preferences
```

### Create Ticket Form

```typescript
// frontend/src/components/tickets/create-ticket-form.tsx
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useCreateTicket } from '@/hooks/use-tickets';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/toast';

const createTicketSchema = z.object({
  title: z.string().min(5, 'Title must be at least 5 characters').max(200),
  description: z.string().min(20, 'Please provide more details').max(10000),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
});

type FormData = z.infer<typeof createTicketSchema>;

export function CreateTicketForm() {
  const { mutate: createTicket, isPending } = useCreateTicket();
  
  const form = useForm<FormData>({
    resolver: zodResolver(createTicketSchema),
    defaultValues: {
      priority: 'medium',
    },
  });

  const onSubmit = (data: FormData) => {
    createTicket(data, {
      onSuccess: (ticket) => {
        toast.success(`Ticket #${ticket.ticketNumber} created!`);
        form.reset();
      },
      onError: (error) => {
        toast.error(error.message);
      },
    });
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      <div className="space-y-2">
        <label htmlFor="title" className="text-sm font-medium">
          Subject
        </label>
        <Input
          id="title"
          placeholder="Brief summary of your issue"
          {...form.register('title')}
        />
        {form.formState.errors.title && (
          <p className="text-sm text-red-500">{form.formState.errors.title.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <label htmlFor="priority" className="text-sm font-medium">
          Priority
        </label>
        <Select
          value={form.watch('priority')}
          onValueChange={(value) => form.setValue('priority', value as any)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="low">Low - General question</SelectItem>
            <SelectItem value="medium">Medium - Issue affecting work</SelectItem>
            <SelectItem value="high">High - Significant impact</SelectItem>
            <SelectItem value="urgent">Urgent - Critical, need immediate help</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <label htmlFor="description" className="text-sm font-medium">
          Description
        </label>
        <Textarea
          id="description"
          placeholder="Please describe your issue in detail..."
          rows={8}
          {...form.register('description')}
        />
        {form.formState.errors.description && (
          <p className="text-sm text-red-500">{form.formState.errors.description.message}</p>
        )}
      </div>

      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? 'Submitting...' : 'Submit Ticket'}
      </Button>
    </form>
  );
}
```

### Customer Ticket View

```typescript
// frontend/src/components/tickets/customer-ticket-view.tsx
'use client';

import { useTicket, useTicketMessages } from '@/hooks/use-tickets';
import { useSocket } from '@/hooks/use-socket';
import { formatDistanceToNow } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { MessageList } from './message-list';
import { ReplyForm } from './reply-form';

interface Props {
  ticketId: string;
}

export function CustomerTicketView({ ticketId }: Props) {
  const { data: ticket, isLoading } = useTicket(ticketId);
  const { data: messages } = useTicketMessages(ticketId);
  
  // Subscribe to real-time updates
  useSocket(`ticket:${ticketId}`, {
    'ticket:updated': (data) => {
      // React Query will handle cache invalidation
    },
    'message:new': (message) => {
      // New message notification
    },
  });

  if (isLoading) return <TicketSkeleton />;
  if (!ticket) return <TicketNotFound />;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="border-b pb-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-gray-500">Ticket #{ticket.ticketNumber}</p>
            <h1 className="text-2xl font-bold mt-1">{ticket.title}</h1>
          </div>
          <div className="flex gap-2">
            <StatusBadge status={ticket.status} />
            <PriorityBadge priority={ticket.priority} />
          </div>
        </div>
        <p className="text-sm text-gray-500 mt-2">
          Created {formatDistanceToNow(new Date(ticket.createdAt), { addSuffix: true })}
        </p>
      </div>

      {/* Original Description */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h2 className="font-medium mb-2">Description</h2>
        <p className="text-gray-700 whitespace-pre-wrap">{ticket.description}</p>
      </div>

      {/* Conversation */}
      <div className="space-y-4">
        <h2 className="font-medium">Conversation</h2>
        <MessageList messages={messages ?? []} />
      </div>

      {/* Reply Form (only if not closed) */}
      {ticket.status !== 'closed' && (
        <ReplyForm ticketId={ticketId} />
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, string> = {
    open: 'bg-yellow-100 text-yellow-800',
    pending: 'bg-blue-100 text-blue-800',
    resolved: 'bg-green-100 text-green-800',
    closed: 'bg-gray-100 text-gray-800',
  };

  return (
    <Badge className={variants[status] || variants.open}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const variants: Record<string, string> = {
    low: 'bg-gray-100 text-gray-600',
    medium: 'bg-blue-100 text-blue-600',
    high: 'bg-orange-100 text-orange-600',
    urgent: 'bg-red-100 text-red-600',
  };

  return (
    <Badge className={variants[priority] || variants.medium}>
      {priority.charAt(0).toUpperCase() + priority.slice(1)}
    </Badge>
  );
}
```

---

## 🎛️ Feature: Agent Dashboard

### User Stories

| As an Agent | I want to...             | So that...                  |
| ----------- | ------------------------ | --------------------------- |
|             | See unassigned tickets   | I can pick up new work      |
|             | View my assigned tickets | I can manage my workload    |
|             | Reply to customers       | I can help resolve issues   |
|             | Add internal notes       | I can collaborate with team |
|             | Use canned responses     | I can respond faster        |
|             | See customer context     | I have full picture         |
|             | Get real-time updates    | I see changes instantly     |

### Agent Dashboard Layout

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Header: Logo | Search | Notifications | Profile                        │
├──────────────────┬──────────────────────────────────────────────────────┤
│                  │                                                       │
│   Sidebar        │   Main Content Area                                   │
│                  │                                                       │
│   📥 Inbox (12)  │   ┌─────────────────────────────────────────────┐    │
│   👤 My Tickets  │   │  Ticket List / Ticket Detail View           │    │
│   🏷️ Unassigned  │   │                                             │    │
│   ✅ Resolved    │   │                                             │    │
│   ⏰ SLA Breach  │   │                                             │    │
│                  │   └─────────────────────────────────────────────┘    │
│   ─────────────  │                                                       │
│   📊 Dashboard   │   ┌─────────────────────────────────────────────┐    │
│   👥 Customers   │   │  Context Sidebar (when viewing ticket)      │    │
│   ⚙️ Settings    │   │  • Customer info                            │    │
│                  │   │  • Previous tickets                         │    │
│                  │   │  • SLA status                                │    │
│                  │   └─────────────────────────────────────────────┘    │
│                  │                                                       │
└──────────────────┴──────────────────────────────────────────────────────┘
```

### Agent Inbox Component

```typescript
// frontend/src/components/agent/inbox.tsx
'use client';

import { useState } from 'react';
import { useTickets } from '@/hooks/use-tickets';
import { useTicketStore } from '@/stores/ticket-store';
import { TicketCard } from './ticket-card';
import { TicketFilters } from './ticket-filters';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

type InboxView = 'all' | 'mine' | 'unassigned' | 'sla-breach';

export function AgentInbox() {
  const [view, setView] = useState<InboxView>('all');
  const { filters, setFilters } = useTicketStore();
  
  const { data, isLoading } = useTickets({
    ...filters,
    // Apply view-specific filters
    ...(view === 'mine' && { assigneeId: 'me' }),
    ...(view === 'unassigned' && { assigneeId: null }),
    ...(view === 'sla-breach' && { slaBreached: true }),
  });

  return (
    <div className="flex flex-col h-full">
      {/* View Tabs */}
      <Tabs value={view} onValueChange={(v) => setView(v as InboxView)}>
        <TabsList className="mb-4">
          <TabsTrigger value="all">
            All Tickets
            <CountBadge count={data?.counts?.all} />
          </TabsTrigger>
          <TabsTrigger value="mine">
            My Tickets
            <CountBadge count={data?.counts?.mine} />
          </TabsTrigger>
          <TabsTrigger value="unassigned">
            Unassigned
            <CountBadge count={data?.counts?.unassigned} />
          </TabsTrigger>
          <TabsTrigger value="sla-breach" className="text-red-600">
            SLA Breach
            <CountBadge count={data?.counts?.slaBreached} variant="danger" />
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Filters */}
      <TicketFilters filters={filters} onChange={setFilters} />

      {/* Ticket List */}
      <div className="flex-1 overflow-y-auto space-y-2 mt-4">
        {isLoading ? (
          <TicketListSkeleton />
        ) : data?.data.length === 0 ? (
          <EmptyInbox view={view} />
        ) : (
          data?.data.map((ticket) => (
            <TicketCard key={ticket.id} ticket={ticket} />
          ))
        )}
      </div>

      {/* Pagination */}
      {data?.pagination && (
        <Pagination
          current={data.pagination.page}
          total={data.pagination.totalPages}
          onChange={(page) => setFilters({ page })}
        />
      )}
    </div>
  );
}
```

### Agent Ticket Detail with Sidebar

```typescript
// frontend/src/components/agent/ticket-detail.tsx
'use client';

import { useTicket } from '@/hooks/use-tickets';
import { useSocket } from '@/hooks/use-socket';
import { TicketHeader } from './ticket-header';
import { TicketConversation } from './ticket-conversation';
import { TicketActions } from './ticket-actions';
import { CustomerSidebar } from './customer-sidebar';
import { SlaSidebar } from './sla-sidebar';

interface Props {
  ticketId: string;
}

export function AgentTicketDetail({ ticketId }: Props) {
  const { data: ticket, isLoading } = useTicket(ticketId);
  
  // Real-time subscription
  useSocket(`ticket:${ticketId}`, {
    'ticket:updated': () => {
      // Handled by React Query invalidation
    },
    'message:new': (message) => {
      // Show notification for new messages
      if (message.senderId !== currentUser.id) {
        showNotification('New message received');
      }
    },
  });

  if (isLoading) return <LoadingState />;
  if (!ticket) return <NotFound />;

  return (
    <div className="flex h-full">
      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <TicketHeader ticket={ticket} />
        
        <div className="flex-1 overflow-y-auto p-4">
          <TicketConversation ticketId={ticketId} />
        </div>
        
        <TicketActions ticket={ticket} />
      </div>

      {/* Context Sidebar */}
      <div className="w-80 border-l bg-gray-50 overflow-y-auto">
        <div className="p-4 space-y-6">
          {/* Customer Info */}
          <CustomerSidebar customerId={ticket.customerId} />
          
          {/* SLA Status */}
          <SlaSidebar ticket={ticket} />
          
          {/* Quick Actions */}
          <QuickActions ticket={ticket} />
          
          {/* Previous Tickets */}
          <PreviousTickets 
            customerId={ticket.customerId} 
            excludeId={ticket.id} 
          />
        </div>
      </div>
    </div>
  );
}
```

### Reply with Canned Responses

```typescript
// frontend/src/components/agent/ticket-reply.tsx
'use client';

import { useState, useRef } from 'react';
import { useCreateMessage } from '@/hooks/use-messages';
import { useCannedResponses } from '@/hooks/use-canned-responses';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';

interface Props {
  ticketId: string;
}

export function TicketReply({ ticketId }: Props) {
  const [content, setContent] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  const { mutate: sendMessage, isPending } = useCreateMessage();
  const { data: cannedResponses } = useCannedResponses();

  const handleSubmit = () => {
    if (!content.trim()) return;
    
    sendMessage({
      ticketId,
      content: content.trim(),
      type: isInternal ? 'internal_note' : 'reply',
    }, {
      onSuccess: () => {
        setContent('');
        textareaRef.current?.focus();
      },
    });
  };

  const insertCannedResponse = (response: CannedResponse) => {
    setContent((prev) => {
      if (prev) return `${prev}\n\n${response.content}`;
      return response.content;
    });
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Cmd/Ctrl + Enter to send
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
    
    // Detect canned response shortcut (e.g., /greeting)
    if (e.key === ' ' && content.startsWith('/')) {
      const shortcut = content.trim();
      const response = cannedResponses?.find(r => r.shortcut === shortcut);
      if (response) {
        e.preventDefault();
        setContent(response.content);
      }
    }
  };

  return (
    <div className="border-t p-4 space-y-3">
      {/* Reply Type Toggle */}
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="radio"
            checked={!isInternal}
            onChange={() => setIsInternal(false)}
            className="text-blue-600"
          />
          <span className="text-sm">Reply to customer</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="radio"
            checked={isInternal}
            onChange={() => setIsInternal(true)}
            className="text-yellow-600"
          />
          <span className="text-sm text-yellow-700">Internal note</span>
        </label>
      </div>

      {/* Text Area */}
      <div className="relative">
        <Textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isInternal 
            ? "Add an internal note (only visible to agents)..."
            : "Type your reply..."
          }
          rows={4}
          className={isInternal ? 'bg-yellow-50 border-yellow-200' : ''}
        />
        <div className="absolute bottom-2 right-2 text-xs text-gray-400">
          ⌘+Enter to send
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* Canned Responses */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                📝 Canned Responses
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0">
              <div className="max-h-64 overflow-y-auto">
                {cannedResponses?.map((response) => (
                  <button
                    key={response.id}
                    onClick={() => insertCannedResponse(response)}
                    className="w-full px-3 py-2 text-left hover:bg-gray-100 border-b"
                  >
                    <div className="font-medium text-sm">{response.title}</div>
                    <div className="text-xs text-gray-500 truncate">
                      {response.content.substring(0, 60)}...
                    </div>
                    {response.shortcut && (
                      <code className="text-xs text-blue-600">{response.shortcut}</code>
                    )}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          {/* Attachments (future) */}
          <Button variant="outline" size="sm" disabled>
            📎 Attach
          </Button>
        </div>

        <Button 
          onClick={handleSubmit} 
          disabled={isPending || !content.trim()}
        >
          {isPending ? 'Sending...' : isInternal ? 'Add Note' : 'Send Reply'}
        </Button>
      </div>
    </div>
  );
}
```

---

## ⚙️ Feature: Admin Panel

### User Stories

| As an Admin | I want to...            | So that...                      |
| ----------- | ----------------------- | ------------------------------- |
|             | Manage team members     | I can add/remove agents         |
|             | Configure SLA policies  | I can set response expectations |
|             | View organization stats | I can track performance         |
|             | Manage canned responses | I can standardize replies       |
|             | Configure settings      | I can customize behavior        |

### Admin Pages

```
/admin
├── /                    → Overview dashboard
├── /team               → Manage agents
├── /sla                → SLA policy configuration
├── /canned-responses   → Manage canned responses
└── /settings           → Organization settings
```

### Team Management

```typescript
// frontend/src/components/admin/team-management.tsx
'use client';

import { useState } from 'react';
import { useTeamMembers, useInviteMember, useUpdateMemberRole, useRemoveMember } from '@/hooks/use-team';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';

export function TeamManagement() {
  const { data: members, isLoading } = useTeamMembers();
  const { mutate: inviteMember } = useInviteMember();
  const { mutate: updateRole } = useUpdateMemberRole();
  const { mutate: removeMember } = useRemoveMember();
  
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Team Management</h1>
        <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
          <DialogTrigger asChild>
            <Button>+ Invite Member</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invite Team Member</DialogTitle>
            </DialogHeader>
            <InviteMemberForm 
              onSubmit={(data) => {
                inviteMember(data);
                setInviteDialogOpen(false);
              }}
            />
          </DialogContent>
        </Dialog>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Member</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Joined</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {members?.map((member) => (
            <TableRow key={member.id}>
              <TableCell>
                <div className="flex items-center gap-3">
                  <Avatar src={member.avatarUrl} fallback={member.name[0]} />
                  <div>
                    <div className="font-medium">{member.name}</div>
                    <div className="text-sm text-gray-500">{member.email}</div>
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <Select
                  value={member.role}
                  onValueChange={(role) => updateRole({ userId: member.id, role })}
                  disabled={member.role === 'owner'}
                >
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="agent">Agent</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="owner" disabled>Owner</SelectItem>
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell>
                <Badge variant={member.isActive ? 'success' : 'secondary'}>
                  {member.isActive ? 'Active' : 'Inactive'}
                </Badge>
              </TableCell>
              <TableCell>
                {new Date(member.joinedAt).toLocaleDateString()}
              </TableCell>
              <TableCell className="text-right">
                {member.role !== 'owner' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-600"
                    onClick={() => {
                      if (confirm(`Remove ${member.name} from the team?`)) {
                        removeMember(member.id);
                      }
                    }}
                  >
                    Remove
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

### SLA Configuration

```typescript
// frontend/src/components/admin/sla-config.tsx
'use client';

import { useSLAPolicies, useUpdateSLAPolicy } from '@/hooks/use-sla';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;

export function SLAConfiguration() {
  const { data: policies } = useSLAPolicies();
  const { mutate: updatePolicy } = useUpdateSLAPolicy();

  const handleTimeChange = (
    policyId: string, 
    field: 'firstResponseTime' | 'resolutionTime', 
    hours: number
  ) => {
    updatePolicy({
      id: policyId,
      [field]: hours * 60, // Convert to minutes
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">SLA Configuration</h1>
        <p className="text-gray-600 mt-1">
          Set response and resolution time targets for each priority level.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {PRIORITIES.map((priority) => {
          const policy = policies?.find(p => p.priority === priority);
          
          return (
            <Card key={priority}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <PriorityIcon priority={priority} />
                  {priority.charAt(0).toUpperCase() + priority.slice(1)} Priority
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>First Response Time</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={0}
                      value={policy ? policy.firstResponseTime / 60 : 0}
                      onChange={(e) => policy && handleTimeChange(
                        policy.id,
                        'firstResponseTime',
                        parseInt(e.target.value) || 0
                      )}
                      className="w-24"
                    />
                    <span className="text-gray-500">hours</span>
                  </div>
                  <p className="text-xs text-gray-500">
                    Time until first agent response
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Resolution Time</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={0}
                      value={policy ? policy.resolutionTime / 60 : 0}
                      onChange={(e) => policy && handleTimeChange(
                        policy.id,
                        'resolutionTime',
                        parseInt(e.target.value) || 0
                      )}
                      className="w-24"
                    />
                    <span className="text-gray-500">hours</span>
                  </div>
                  <p className="text-xs text-gray-500">
                    Time until ticket is resolved
                  </p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
```

---

## 📊 Feature: Dashboard Analytics

### Key Metrics (MVP)

```typescript
// Types for dashboard stats
interface DashboardStats {
  // Ticket counts
  tickets: {
    total: number;
    open: number;
    pending: number;
    resolved: number;
    closed: number;
  };
  
  // SLA metrics
  sla: {
    breachedCount: number;
    atRiskCount: number;
    complianceRate: number; // percentage
  };
  
  // Performance
  performance: {
    avgFirstResponseTime: number; // minutes
    avgResolutionTime: number;    // minutes
    ticketsResolvedToday: number;
  };
  
  // Trends (last 7 days)
  trends: {
    date: string;
    created: number;
    resolved: number;
  }[];
}
```

### Dashboard Component

```typescript
// frontend/src/components/dashboard/stats-overview.tsx
'use client';

import { useDashboardStats } from '@/hooks/use-dashboard';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { formatDuration } from '@/lib/utils';

export function StatsOverview() {
  const { data: stats, isLoading } = useDashboardStats();

  if (isLoading) return <StatsSkeleton />;

  return (
    <div className="space-y-6">
      {/* Quick Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard
          title="Open Tickets"
          value={stats.tickets.open}
          icon="📥"
          trend={stats.tickets.open > 10 ? 'warning' : 'normal'}
        />
        <StatCard
          title="Pending Response"
          value={stats.tickets.pending}
          icon="⏳"
        />
        <StatCard
          title="Resolved Today"
          value={stats.performance.ticketsResolvedToday}
          icon="✅"
        />
        <StatCard
          title="SLA Compliance"
          value={`${stats.sla.complianceRate}%`}
          icon="📊"
          trend={stats.sla.complianceRate < 90 ? 'danger' : 'success'}
        />
      </div>

      {/* Performance Metrics */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Average Response Times</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-gray-600">First Response</span>
                <span className="font-semibold">
                  {formatDuration(stats.performance.avgFirstResponseTime)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Resolution</span>
                <span className="font-semibold">
                  {formatDuration(stats.performance.avgResolutionTime)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>SLA Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-red-600">⚠️ Breached</span>
                <span className="font-semibold text-red-600">
                  {stats.sla.breachedCount}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-yellow-600">⏰ At Risk</span>
                <span className="font-semibold text-yellow-600">
                  {stats.sla.atRiskCount}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 7-Day Trend */}
      <Card>
        <CardHeader>
          <CardTitle>7-Day Ticket Trend</CardTitle>
        </CardHeader>
        <CardContent>
          <SimpleBarChart data={stats.trends} />
        </CardContent>
      </Card>
    </div>
  );
}
```

---

## 📧 Feature: Email Notifications

### Notification Types

```typescript
// backend/src/jobs/email.job.ts
export const EMAIL_TEMPLATES = {
  // Customer emails
  ticketCreated: {
    subject: 'Ticket #{ticketNumber} created',
    to: 'customer',
  },
  ticketAssigned: {
    subject: 'An agent is working on your ticket #{ticketNumber}',
    to: 'customer',
  },
  ticketReplied: {
    subject: 'New reply on ticket #{ticketNumber}',
    to: 'customer',
  },
  ticketResolved: {
    subject: 'Ticket #{ticketNumber} has been resolved',
    to: 'customer',
  },
  
  // Agent emails
  ticketAssignedToYou: {
    subject: 'Ticket #{ticketNumber} assigned to you',
    to: 'agent',
  },
  customerReplied: {
    subject: 'Customer replied to ticket #{ticketNumber}',
    to: 'agent',
  },
  slaWarning: {
    subject: '⚠️ SLA breach warning for ticket #{ticketNumber}',
    to: 'agent',
  },
} as const;
```

### Email Service

```typescript
// backend/src/lib/email.ts
import { Resend } from 'resend';
import { config } from '../config';

const resend = new Resend(config.resendApiKey);

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}

export async function sendEmail(params: SendEmailParams) {
  if (config.env === 'development') {
    console.log('📧 Email (dev mode):', params);
    return { id: 'dev-email-id' };
  }

  return resend.emails.send({
    from: config.emailFrom,
    ...params,
  });
}

// Email templates
export function renderTicketCreatedEmail(ticket: Ticket, customer: User) {
  return `
    <!DOCTYPE html>
    <html>
      <body style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h1>Hello ${customer.name},</h1>
        
        <p>Thank you for contacting support. We've received your ticket:</p>
        
        <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 16px 0;">
          <strong>Ticket #${ticket.ticketNumber}</strong><br/>
          <strong>${ticket.title}</strong><br/>
          <small style="color: #666;">Priority: ${ticket.priority}</small>
        </div>
        
        <p>Our team will review your request and get back to you shortly.</p>
        
        <p>
          <a href="${config.frontendUrl}/portal/tickets/${ticket.id}" 
             style="background: #3b82f6; color: white; padding: 12px 24px; 
                    text-decoration: none; border-radius: 6px; display: inline-block;">
            View Ticket
          </a>
        </p>
        
        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
        
        <p style="color: #666; font-size: 12px;">
          You received this email because you submitted a support request.
        </p>
      </body>
    </html>
  `;
}
```

---

## ✅ MVP Feature Checklist

### Phase 1: Foundation (Week 1-2)
- [ ] User registration & login
- [ ] Organization creation
- [ ] Basic role assignment

### Phase 2: Tickets (Week 3-4)
- [ ] Customer: Create ticket
- [ ] Customer: View own tickets
- [ ] Agent: View all tickets
- [ ] Agent: Reply to tickets
- [ ] Ticket status changes

### Phase 3: Real-time (Week 5-6)
- [ ] Live ticket updates
- [ ] New message notifications
- [ ] Agent presence indicators

### Phase 4: SLA & Polish (Week 7-8)
- [ ] SLA tracking
- [ ] Email notifications
- [ ] Canned responses
- [ ] Basic dashboard

---

## Next Steps

→ Continue to [06-api-design.md](./06-api-design.md) to design the REST API.
