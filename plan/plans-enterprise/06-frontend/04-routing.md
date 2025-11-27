# Routing

> Next.js App Router patterns for InsightDesk

---

## Table of Contents

- [Route Structure](#route-structure)
- [Route Groups](#route-groups)
- [Dynamic Routes](#dynamic-routes)
- [Middleware](#middleware)
- [Loading and Error States](#loading-and-error-states)
- [Parallel Routes](#parallel-routes)

---

## Route Structure

### App Directory Layout

```
app/
├── (auth)/                     # Auth route group (no layout)
│   ├── login/
│   │   └── page.tsx
│   ├── register/
│   │   └── page.tsx
│   ├── forgot-password/
│   │   └── page.tsx
│   └── reset-password/
│       └── page.tsx
├── (dashboard)/                # Dashboard route group
│   ├── layout.tsx              # Shared dashboard layout
│   ├── page.tsx                # /dashboard
│   ├── tickets/
│   │   ├── page.tsx            # /tickets
│   │   ├── new/
│   │   │   └── page.tsx        # /tickets/new
│   │   └── [id]/
│   │       ├── page.tsx        # /tickets/:id
│   │       ├── loading.tsx
│   │       └── edit/
│   │           └── page.tsx    # /tickets/:id/edit
│   ├── knowledge-base/
│   │   ├── page.tsx            # /knowledge-base
│   │   ├── [slug]/
│   │   │   └── page.tsx        # /knowledge-base/:slug
│   │   └── categories/
│   │       └── [id]/
│   │           └── page.tsx    # /knowledge-base/categories/:id
│   ├── analytics/
│   │   └── page.tsx            # /analytics
│   ├── automation/
│   │   ├── page.tsx            # /automation
│   │   └── [id]/
│   │       └── page.tsx        # /automation/:id
│   └── settings/
│       ├── page.tsx            # /settings
│       ├── profile/
│       │   └── page.tsx        # /settings/profile
│       ├── team/
│       │   └── page.tsx        # /settings/team
│       └── organization/
│           └── page.tsx        # /settings/organization
├── api/                        # API routes
│   ├── auth/
│   │   ├── login/
│   │   │   └── route.ts
│   │   ├── logout/
│   │   │   └── route.ts
│   │   └── refresh/
│   │       └── route.ts
│   └── webhooks/
│       └── route.ts
├── layout.tsx                  # Root layout
├── loading.tsx                 # Global loading
├── error.tsx                   # Global error
├── not-found.tsx               # 404 page
└── globals.css
```

---

## Route Groups

### Auth Route Group

```tsx
// app/(auth)/layout.tsx
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted">
      <div className="w-full max-w-md p-6">
        {children}
      </div>
    </div>
  );
}
```

```tsx
// app/(auth)/login/page.tsx
import { LoginForm } from '@/components/features/auth/LoginForm';

export const metadata = {
  title: 'Login | InsightDesk',
};

export default function LoginPage() {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold">Welcome back</h1>
        <p className="text-muted-foreground">
          Sign in to your account
        </p>
      </div>
      <LoginForm />
    </div>
  );
}
```

### Dashboard Route Group

```tsx
// app/(dashboard)/layout.tsx
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { QueryProvider } from '@/lib/providers/query-provider';
import { WebSocketProvider } from '@/lib/providers/websocket-provider';

export default async function DashboardRouteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  
  if (!session) {
    redirect('/login');
  }

  return (
    <QueryProvider>
      <WebSocketProvider>
        <DashboardLayout user={session.user}>
          {children}
        </DashboardLayout>
      </WebSocketProvider>
    </QueryProvider>
  );
}
```

---

## Dynamic Routes

### Ticket Detail Page

```tsx
// app/(dashboard)/tickets/[id]/page.tsx
import { notFound } from 'next/navigation';
import { getTicket } from '@/lib/api/tickets';
import { TicketDetail } from '@/components/features/tickets/TicketDetail';

interface TicketPageProps {
  params: { id: string };
}

export async function generateMetadata({ params }: TicketPageProps) {
  const ticket = await getTicket(params.id);
  
  if (!ticket) {
    return { title: 'Ticket Not Found' };
  }

  return {
    title: `${ticket.ticketNumber} - ${ticket.subject} | InsightDesk`,
    description: ticket.description.slice(0, 160),
  };
}

export default async function TicketPage({ params }: TicketPageProps) {
  const ticket = await getTicket(params.id);

  if (!ticket) {
    notFound();
  }

  return <TicketDetail ticket={ticket} />;
}
```

### Catch-All Routes

```tsx
// app/(dashboard)/knowledge-base/[...slug]/page.tsx
interface ArticlePageProps {
  params: { slug: string[] };
}

export default async function ArticlePage({ params }: ArticlePageProps) {
  // slug could be ['category', 'subcategory', 'article-slug']
  const slugPath = params.slug.join('/');
  const article = await getArticleBySlug(slugPath);

  if (!article) {
    notFound();
  }

  return <ArticleView article={article} />;
}
```

### Optional Catch-All

```tsx
// app/(dashboard)/search/[[...filters]]/page.tsx
interface SearchPageProps {
  params: { filters?: string[] };
  searchParams: { q?: string };
}

export default function SearchPage({ params, searchParams }: SearchPageProps) {
  // filters is optional: /search, /search/tickets, /search/tickets/open
  const [type, status] = params.filters || [];
  const query = searchParams.q;

  return (
    <SearchResults
      query={query}
      type={type}
      status={status}
    />
  );
}
```

---

## Middleware

### Auth Middleware

```typescript
// middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyToken } from '@/lib/auth/jwt';

// Routes that don't require authentication
const publicRoutes = [
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
];

// Routes that require specific roles
const roleRoutes: Record<string, string[]> = {
  '/settings/organization': ['admin', 'owner'],
  '/settings/team': ['admin', 'owner', 'manager'],
  '/automation': ['admin', 'owner', 'manager'],
};

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip public routes and API routes
  if (publicRoutes.some(route => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  if (pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  // Get access token from cookie
  const token = request.cookies.get('accessToken')?.value;

  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  try {
    const payload = await verifyToken(token);

    // Check role-based routes
    for (const [route, roles] of Object.entries(roleRoutes)) {
      if (pathname.startsWith(route)) {
        if (!roles.includes(payload.role)) {
          return NextResponse.redirect(new URL('/dashboard', request.url));
        }
      }
    }

    // Add user info to headers for server components
    const response = NextResponse.next();
    response.headers.set('x-user-id', payload.sub);
    response.headers.set('x-user-role', payload.role);

    return response;
  } catch {
    // Token invalid or expired, redirect to login
    const response = NextResponse.redirect(new URL('/login', request.url));
    response.cookies.delete('accessToken');
    return response;
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|public).*)',
  ],
};
```

---

## Loading and Error States

### Loading UI

```tsx
// app/(dashboard)/tickets/loading.tsx
import { Skeleton } from '@/components/ui/skeleton';

export default function TicketsLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-32" />
      </div>
      
      <div className="space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
    </div>
  );
}
```

```tsx
// app/(dashboard)/tickets/[id]/loading.tsx
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

export default function TicketDetailLoading() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-6">
        <Card>
          <CardHeader>
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-6 w-3/4" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-32 w-full" />
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
      </div>
      
      <div className="lg:col-span-1">
        <Card>
          <CardContent className="pt-6 space-y-4">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
```

### Error Handling

```tsx
// app/(dashboard)/tickets/error.tsx
'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { AlertCircle } from 'lucide-react';

export default function TicketsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log error to monitoring service
    console.error('Tickets error:', error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
      <AlertCircle className="h-12 w-12 text-destructive" />
      <h2 className="text-xl font-semibold">Something went wrong!</h2>
      <p className="text-muted-foreground text-center max-w-md">
        We encountered an error loading tickets. Please try again.
      </p>
      <Button onClick={() => reset()}>Try again</Button>
    </div>
  );
}
```

### Not Found

```tsx
// app/(dashboard)/tickets/[id]/not-found.tsx
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { FileQuestion } from 'lucide-react';

export default function TicketNotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
      <FileQuestion className="h-12 w-12 text-muted-foreground" />
      <h2 className="text-xl font-semibold">Ticket not found</h2>
      <p className="text-muted-foreground text-center max-w-md">
        The ticket you're looking for doesn't exist or you don't have access to it.
      </p>
      <Button asChild>
        <Link href="/tickets">Back to Tickets</Link>
      </Button>
    </div>
  );
}
```

---

## Parallel Routes

### Modal Routes

```tsx
// app/(dashboard)/tickets/@modal/(.)new/page.tsx
// Intercepts /tickets/new as a modal
import { Modal } from '@/components/ui/modal';
import { CreateTicketForm } from '@/components/features/tickets/CreateTicketForm';

export default function NewTicketModal() {
  return (
    <Modal title="Create Ticket">
      <CreateTicketForm />
    </Modal>
  );
}
```

```tsx
// app/(dashboard)/tickets/layout.tsx
interface TicketsLayoutProps {
  children: React.ReactNode;
  modal: React.ReactNode;
}

export default function TicketsLayout({ children, modal }: TicketsLayoutProps) {
  return (
    <>
      {children}
      {modal}
    </>
  );
}
```

```tsx
// app/(dashboard)/tickets/@modal/default.tsx
// Default slot when no modal is active
export default function Default() {
  return null;
}
```

### Split View

```tsx
// app/(dashboard)/tickets/layout.tsx
interface TicketsLayoutProps {
  children: React.ReactNode;
  sidebar: React.ReactNode;
}

export default function TicketsLayout({ children, sidebar }: TicketsLayoutProps) {
  return (
    <div className="grid grid-cols-12 gap-6">
      <div className="col-span-8">{children}</div>
      <div className="col-span-4">{sidebar}</div>
    </div>
  );
}
```

---

## Navigation

### Link Component Usage

```tsx
// components/layout/Navigation.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const links = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/tickets', label: 'Tickets' },
  { href: '/knowledge-base', label: 'Knowledge Base' },
];

export function Navigation() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-4">
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className={cn(
            'text-sm font-medium transition-colors hover:text-primary',
            pathname.startsWith(link.href)
              ? 'text-foreground'
              : 'text-muted-foreground'
          )}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
```

### Programmatic Navigation

```tsx
// components/features/tickets/CreateTicketButton.tsx
'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';

export function CreateTicketButton() {
  const router = useRouter();

  const handleClick = () => {
    router.push('/tickets/new');
  };

  return (
    <Button onClick={handleClick}>
      <Plus className="h-4 w-4 mr-2" />
      New Ticket
    </Button>
  );
}
```

---

## Related Documents

- [Frontend Overview](overview.md) — Architecture overview
- [Components](components.md) — Component system
- [State Management](state-management.md) — Client state
- [Accessibility](accessibility.md) — WCAG compliance

---

*Next: [Accessibility →](accessibility.md)*
