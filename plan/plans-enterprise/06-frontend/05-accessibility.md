# Accessibility

> WCAG 2.1 AA compliance guidelines for InsightDesk

---

## Table of Contents

- [Accessibility Standards](#accessibility-standards)
- [Keyboard Navigation](#keyboard-navigation)
- [Screen Reader Support](#screen-reader-support)
- [Visual Accessibility](#visual-accessibility)
- [Forms and Inputs](#forms-and-inputs)
- [Testing Accessibility](#testing-accessibility)

---

## Accessibility Standards

### WCAG 2.1 Level AA Checklist

| Principle | Guideline | Status |
|-----------|-----------|--------|
| **Perceivable** | | |
| | 1.1 Text Alternatives | ✅ Required |
| | 1.2 Time-based Media | ⚪ If applicable |
| | 1.3 Adaptable | ✅ Required |
| | 1.4 Distinguishable | ✅ Required |
| **Operable** | | |
| | 2.1 Keyboard Accessible | ✅ Required |
| | 2.2 Enough Time | ✅ Required |
| | 2.3 Seizures | ⚪ If applicable |
| | 2.4 Navigable | ✅ Required |
| | 2.5 Input Modalities | ✅ Required |
| **Understandable** | | |
| | 3.1 Readable | ✅ Required |
| | 3.2 Predictable | ✅ Required |
| | 3.3 Input Assistance | ✅ Required |
| **Robust** | | |
| | 4.1 Compatible | ✅ Required |

---

## Keyboard Navigation

### Focus Management

```tsx
// lib/hooks/useFocusTrap.ts
import { useEffect, useRef } from 'react';

export function useFocusTrap<T extends HTMLElement>() {
  const containerRef = useRef<T>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const focusableElements = container.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusableElements[0] as HTMLElement;
    const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    };

    container.addEventListener('keydown', handleKeyDown);
    firstElement?.focus();

    return () => {
      container.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return containerRef;
}
```

### Skip Links

```tsx
// components/layout/SkipLinks.tsx
export function SkipLinks() {
  return (
    <div className="sr-only focus-within:not-sr-only">
      <a
        href="#main-content"
        className="absolute left-4 top-4 z-50 rounded-md bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only"
      >
        Skip to main content
      </a>
      <a
        href="#navigation"
        className="absolute left-4 top-16 z-50 rounded-md bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only"
      >
        Skip to navigation
      </a>
    </div>
  );
}
```

### Keyboard Shortcuts

```tsx
// lib/hooks/useKeyboardShortcuts.ts
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUIStore } from '@/lib/stores/ui.store';

export function useKeyboardShortcuts() {
  const router = useRouter();
  const { toggleCommandPalette } = useUIStore();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      // Command palette: Cmd/Ctrl + K
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        toggleCommandPalette();
      }

      // Navigation shortcuts
      if (e.key === 'g') {
        // Wait for second key
        const handleSecondKey = (e2: KeyboardEvent) => {
          switch (e2.key) {
            case 'd':
              router.push('/dashboard');
              break;
            case 't':
              router.push('/tickets');
              break;
            case 'k':
              router.push('/knowledge-base');
              break;
            case 's':
              router.push('/settings');
              break;
          }
          document.removeEventListener('keydown', handleSecondKey);
        };

        document.addEventListener('keydown', handleSecondKey, { once: true });
        
        // Cancel after 1 second
        setTimeout(() => {
          document.removeEventListener('keydown', handleSecondKey);
        }, 1000);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [router, toggleCommandPalette]);
}
```

### Roving Tab Index

```tsx
// components/ui/menu.tsx
'use client';

import { useState, useRef, useEffect, Children, cloneElement } from 'react';

interface RovingTabIndexProps {
  children: React.ReactElement[];
  orientation?: 'horizontal' | 'vertical';
}

export function RovingTabIndex({ 
  children, 
  orientation = 'vertical' 
}: RovingTabIndexProps) {
  const [focusedIndex, setFocusedIndex] = useState(0);
  const itemsRef = useRef<(HTMLElement | null)[]>([]);

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    const nextKey = orientation === 'vertical' ? 'ArrowDown' : 'ArrowRight';
    const prevKey = orientation === 'vertical' ? 'ArrowUp' : 'ArrowLeft';

    let newIndex = index;

    switch (e.key) {
      case nextKey:
        e.preventDefault();
        newIndex = (index + 1) % children.length;
        break;
      case prevKey:
        e.preventDefault();
        newIndex = (index - 1 + children.length) % children.length;
        break;
      case 'Home':
        e.preventDefault();
        newIndex = 0;
        break;
      case 'End':
        e.preventDefault();
        newIndex = children.length - 1;
        break;
      default:
        return;
    }

    setFocusedIndex(newIndex);
    itemsRef.current[newIndex]?.focus();
  };

  return (
    <>
      {Children.map(children, (child, index) =>
        cloneElement(child, {
          ref: (el: HTMLElement) => (itemsRef.current[index] = el),
          tabIndex: index === focusedIndex ? 0 : -1,
          onKeyDown: (e: React.KeyboardEvent) => handleKeyDown(e, index),
          onFocus: () => setFocusedIndex(index),
        })
      )}
    </>
  );
}
```

---

## Screen Reader Support

### ARIA Attributes

```tsx
// components/features/tickets/TicketStatus.tsx
interface TicketStatusProps {
  status: 'open' | 'pending' | 'resolved' | 'closed';
}

export function TicketStatus({ status }: TicketStatusProps) {
  const statusConfig = {
    open: { label: 'Open', color: 'bg-blue-500' },
    pending: { label: 'Pending response', color: 'bg-yellow-500' },
    resolved: { label: 'Resolved', color: 'bg-green-500' },
    closed: { label: 'Closed', color: 'bg-gray-500' },
  };

  const config = statusConfig[status];

  return (
    <span
      role="status"
      aria-label={`Ticket status: ${config.label}`}
      className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${config.color} text-white`}
    >
      <span className="sr-only">Status: </span>
      {config.label}
    </span>
  );
}
```

### Live Regions

```tsx
// components/ui/toast.tsx
'use client';

import { useEffect, useState } from 'react';

interface ToastProps {
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
  duration?: number;
}

export function Toast({ message, type, duration = 5000 }: ToastProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), duration);
    return () => clearTimeout(timer);
  }, [duration]);

  if (!visible) return null;

  return (
    <div
      role="alert"
      aria-live="polite"
      aria-atomic="true"
      className={`fixed bottom-4 right-4 p-4 rounded-md shadow-lg ${
        type === 'error' ? 'bg-destructive text-destructive-foreground' :
        type === 'success' ? 'bg-green-500 text-white' :
        type === 'warning' ? 'bg-yellow-500 text-black' :
        'bg-primary text-primary-foreground'
      }`}
    >
      {message}
    </div>
  );
}
```

```tsx
// components/features/tickets/TicketLoadingAnnouncer.tsx
export function TicketLoadingAnnouncer({ 
  isLoading 
}: { 
  isLoading: boolean 
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy={isLoading}
      className="sr-only"
    >
      {isLoading ? 'Loading tickets...' : 'Tickets loaded'}
    </div>
  );
}
```

### Semantic HTML

```tsx
// components/features/tickets/TicketList.tsx
interface TicketListProps {
  tickets: Ticket[];
}

export function TicketList({ tickets }: TicketListProps) {
  return (
    <section aria-labelledby="tickets-heading">
      <h2 id="tickets-heading" className="text-xl font-semibold mb-4">
        Your Tickets
      </h2>
      
      {tickets.length === 0 ? (
        <p role="status">No tickets found.</p>
      ) : (
        <ul role="list" className="space-y-4">
          {tickets.map((ticket) => (
            <li key={ticket.id}>
              <article aria-labelledby={`ticket-${ticket.id}-title`}>
                <h3 id={`ticket-${ticket.id}-title`}>
                  <a href={`/tickets/${ticket.id}`}>
                    {ticket.subject}
                  </a>
                </h3>
                <p className="text-muted-foreground">
                  {ticket.description}
                </p>
                <footer className="flex gap-4 text-sm text-muted-foreground">
                  <span>
                    <span className="sr-only">Created </span>
                    {formatDate(ticket.createdAt)}
                  </span>
                  <TicketStatus status={ticket.status} />
                </footer>
              </article>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

---

## Visual Accessibility

### Color Contrast

```css
/* Ensure WCAG AA contrast ratios */
:root {
  /* 4.5:1 for normal text, 3:1 for large text */
  --foreground: 222.2 84% 4.9%;      /* #0d0f14 on white = 17.5:1 */
  --muted-foreground: 215.4 16.3% 46.9%; /* #6b7280 on white = 4.6:1 */
  --primary: 222.2 47.4% 11.2%;      /* #141b2d on white = 15.2:1 */
  --destructive: 0 84.2% 60.2%;      /* #ef4444 on white = 4.5:1 */
}

/* Focus indicators */
*:focus-visible {
  outline: 2px solid hsl(var(--ring));
  outline-offset: 2px;
}
```

### Focus Indicators

```tsx
// components/ui/button.tsx
const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, ...props }, ref) => {
    return (
      <button
        className={cn(
          // Base styles
          'inline-flex items-center justify-center rounded-md text-sm font-medium',
          // Focus styles - high visibility
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          // Disabled styles
          'disabled:pointer-events-none disabled:opacity-50',
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
```

### Reduced Motion

```tsx
// lib/hooks/useReducedMotion.ts
import { useEffect, useState } from 'react';

export function useReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mediaQuery.matches);

    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handler);

    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  return reducedMotion;
}
```

```css
/* Respect reduced motion preference */
@media (prefers-reduced-motion: reduce) {
  *,
  ::before,
  ::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

---

## Forms and Inputs

### Accessible Form Fields

```tsx
// components/ui/form-field.tsx
import { useId } from 'react';

interface FormFieldProps {
  label: string;
  error?: string;
  description?: string;
  required?: boolean;
  children: (props: {
    id: string;
    'aria-describedby': string | undefined;
    'aria-invalid': boolean;
    'aria-required': boolean;
  }) => React.ReactNode;
}

export function FormField({
  label,
  error,
  description,
  required = false,
  children,
}: FormFieldProps) {
  const id = useId();
  const descriptionId = `${id}-description`;
  const errorId = `${id}-error`;

  const describedBy = [
    description && descriptionId,
    error && errorId,
  ].filter(Boolean).join(' ') || undefined;

  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
        {required && (
          <span className="text-destructive ml-1" aria-hidden="true">*</span>
        )}
        {required && <span className="sr-only">(required)</span>}
      </label>

      {children({
        id,
        'aria-describedby': describedBy,
        'aria-invalid': !!error,
        'aria-required': required,
      })}

      {description && (
        <p id={descriptionId} className="text-sm text-muted-foreground">
          {description}
        </p>
      )}

      {error && (
        <p id={errorId} className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
```

### Error Handling

```tsx
// components/features/tickets/CreateTicketForm.tsx
'use client';

import { useRef, useEffect } from 'react';

export function CreateTicketForm() {
  const errorRef = useRef<HTMLDivElement>(null);
  const { formState: { errors } } = useForm();

  // Focus first error on submit
  useEffect(() => {
    if (Object.keys(errors).length > 0) {
      errorRef.current?.focus();
    }
  }, [errors]);

  const hasErrors = Object.keys(errors).length > 0;

  return (
    <form>
      {hasErrors && (
        <div
          ref={errorRef}
          role="alert"
          tabIndex={-1}
          className="mb-4 p-4 bg-destructive/10 border border-destructive rounded-md"
        >
          <h3 className="font-medium text-destructive">
            Please fix the following errors:
          </h3>
          <ul className="mt-2 list-disc list-inside text-sm text-destructive">
            {Object.entries(errors).map(([field, error]) => (
              <li key={field}>{error?.message as string}</li>
            ))}
          </ul>
        </div>
      )}
      
      {/* Form fields... */}
    </form>
  );
}
```

---

## Testing Accessibility

### Automated Testing

```tsx
// __tests__/accessibility/tickets.test.tsx
import { render } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import { TicketList } from '@/components/features/tickets/TicketList';

expect.extend(toHaveNoViolations);

describe('TicketList Accessibility', () => {
  it('should have no accessibility violations', async () => {
    const tickets = [
      { id: '1', subject: 'Test ticket', status: 'open', /* ... */ },
    ];

    const { container } = render(<TicketList tickets={tickets} />);
    const results = await axe(container);

    expect(results).toHaveNoViolations();
  });

  it('should announce loading state', () => {
    const { getByRole } = render(<TicketList tickets={[]} isLoading />);
    
    expect(getByRole('status')).toHaveTextContent('Loading tickets...');
  });

  it('should have proper heading hierarchy', () => {
    const { getByRole } = render(<TicketList tickets={[]} />);
    
    expect(getByRole('heading', { level: 2 })).toHaveTextContent('Your Tickets');
  });
});
```

### Manual Testing Checklist

```markdown
## Accessibility Testing Checklist

### Keyboard Navigation
- [ ] All interactive elements are focusable
- [ ] Focus order is logical
- [ ] Focus is visible on all elements
- [ ] No keyboard traps
- [ ] Skip links work correctly
- [ ] Modal focus is trapped

### Screen Reader
- [ ] All images have alt text
- [ ] Form labels are associated
- [ ] ARIA landmarks are present
- [ ] Live regions announce changes
- [ ] Links and buttons have descriptive text

### Visual
- [ ] Color contrast meets 4.5:1 (text) / 3:1 (large text)
- [ ] Information not conveyed by color alone
- [ ] Text is resizable to 200%
- [ ] Content reflows at 320px width

### Cognitive
- [ ] Error messages are clear
- [ ] Forms have instructions
- [ ] Timeouts can be extended
- [ ] Animations can be disabled
```

### Browser Extensions

```bash
# Recommended accessibility testing tools:
# - axe DevTools (Chrome/Firefox)
# - WAVE Evaluation Tool
# - Accessibility Insights for Web
# - Lighthouse Accessibility Audit
```

---

## Related Documents

- [Frontend Overview](overview.md) — Architecture overview
- [Components](components.md) — Component system
- [State Management](state-management.md) — Client state
- [Routing](routing.md) — App Router patterns

---

*Next: [DevOps Documentation →](../07-devops/docker.md)*
