# Notifications Module

> Multi-channel notification delivery, preferences, and templates

---

## Table of Contents

- [Overview](#overview)
- [Directory Structure](#directory-structure)
- [Channel Providers](#channel-providers)
- [Notification Service](#notification-service)
- [Template System](#template-system)
- [User Preferences](#user-preferences)
- [Queue Processing](#queue-processing)

---

## Overview

The Notifications module handles:

- Multi-channel delivery (email, push, in-app, SMS)
- User notification preferences
- Template management with variables
- Rate limiting and batching
- Delivery tracking and analytics
- Retry handling for failed deliveries

---

## Directory Structure

```
modules/notifications/
├── controllers/
│   ├── notifications.controller.ts
│   ├── preferences.controller.ts
│   └── templates.controller.ts
├── services/
│   ├── notification.service.ts   # Core notification logic
│   ├── preferences.service.ts    # User preferences
│   ├── template.service.ts       # Template rendering
│   └── delivery.service.ts       # Delivery orchestration
├── providers/
│   ├── email.provider.ts         # Email (Resend)
│   ├── push.provider.ts          # Push notifications
│   ├── sms.provider.ts           # SMS (optional)
│   └── slack.provider.ts         # Slack integration
├── repositories/
│   ├── notification.repository.ts
│   ├── preferences.repository.ts
│   └── template.repository.ts
├── jobs/
│   ├── notification.worker.ts    # Queue processor
│   └── digest.worker.ts          # Digest emails
├── types/
│   └── notification.types.ts
└── index.ts
```

---

## Channel Providers

### Email Provider (Resend)

```typescript
// providers/email.provider.ts
import { Resend } from 'resend';

export class EmailProvider implements NotificationProvider {
  private client: Resend;

  constructor() {
    this.client = new Resend(config.resend.apiKey);
  }

  async send(notification: EmailNotification): Promise<DeliveryResult> {
    try {
      const result = await this.client.emails.send({
        from: config.email.from,
        to: notification.to,
        subject: notification.subject,
        html: notification.html,
        text: notification.text,
        replyTo: notification.replyTo,
        headers: {
          'X-Notification-Id': notification.id,
        },
      });

      return {
        success: true,
        providerId: result.id,
        channel: 'email',
      };
    } catch (error) {
      logger.error('Email send failed', {
        notificationId: notification.id,
        to: notification.to,
        error,
      });

      return {
        success: false,
        error: error.message,
        channel: 'email',
        retryable: this.isRetryable(error),
      };
    }
  }

  private isRetryable(error: any): boolean {
    // Rate limit or temporary errors
    return error.statusCode === 429 || error.statusCode >= 500;
  }
}
```

### Push Provider (Web Push)

```typescript
// providers/push.provider.ts
import webpush from 'web-push';

export class PushProvider implements NotificationProvider {
  constructor() {
    webpush.setVapidDetails(
      `mailto:${config.email.support}`,
      config.webPush.publicKey,
      config.webPush.privateKey
    );
  }

  async send(notification: PushNotification): Promise<DeliveryResult> {
    const subscription = notification.subscription;

    try {
      await webpush.sendNotification(
        subscription,
        JSON.stringify({
          title: notification.title,
          body: notification.body,
          icon: notification.icon || '/icon-192.png',
          badge: notification.badge || '/badge-72.png',
          data: {
            url: notification.url,
            notificationId: notification.id,
          },
          actions: notification.actions,
        })
      );

      return { success: true, channel: 'push' };
    } catch (error) {
      if (error.statusCode === 410) {
        // Subscription expired, remove it
        await this.removeSubscription(notification.userId, subscription);
      }

      return {
        success: false,
        error: error.message,
        channel: 'push',
        retryable: error.statusCode >= 500,
      };
    }
  }

  async registerSubscription(
    userId: string,
    subscription: PushSubscription
  ): Promise<void> {
    await prisma.pushSubscription.upsert({
      where: {
        userId_endpoint: { userId, endpoint: subscription.endpoint },
      },
      create: {
        userId,
        endpoint: subscription.endpoint,
        keys: subscription.keys,
        userAgent: subscription.userAgent,
      },
      update: {
        keys: subscription.keys,
        userAgent: subscription.userAgent,
      },
    });
  }

  private async removeSubscription(
    userId: string,
    subscription: PushSubscription
  ): Promise<void> {
    await prisma.pushSubscription.delete({
      where: {
        userId_endpoint: { userId, endpoint: subscription.endpoint },
      },
    });
  }
}
```

### In-App Provider

```typescript
// providers/inapp.provider.ts
export class InAppProvider implements NotificationProvider {
  async send(notification: InAppNotification): Promise<DeliveryResult> {
    // Store in database
    const stored = await prisma.notification.create({
      data: {
        userId: notification.userId,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        data: notification.data,
        readAt: null,
      },
    });

    // Send via WebSocket if user is online
    const socketNsp = io.of('/notifications');
    socketNsp.to(`user:${notification.userId}`).emit('notification', {
      id: stored.id,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      data: notification.data,
      createdAt: stored.createdAt,
    });

    // Update unread count
    const unreadCount = await prisma.notification.count({
      where: { userId: notification.userId, readAt: null },
    });

    socketNsp.to(`user:${notification.userId}`).emit('notification:count', {
      unread: unreadCount,
    });

    return { success: true, channel: 'inapp', providerId: stored.id };
  }
}
```

---

## Notification Service

### Core Service

```typescript
// services/notification.service.ts
export class NotificationService {
  constructor(
    private preferencesService: PreferencesService,
    private templateService: TemplateService,
    private deliveryService: DeliveryService,
    private notificationRepo: NotificationRepository
  ) {}

  async notify(
    type: NotificationType,
    userId: string,
    data: NotificationData
  ): Promise<void> {
    // Get user preferences
    const preferences = await this.preferencesService.get(userId);

    // Check if user wants this notification type
    const typePrefs = preferences.types[type];
    if (!typePrefs || typePrefs.enabled === false) {
      logger.debug('Notification skipped - disabled by user', {
        userId,
        type,
      });
      return;
    }

    // Determine channels
    const channels = this.determineChannels(type, typePrefs, preferences);

    // Get template
    const template = await this.templateService.get(type);

    // Queue for each channel
    for (const channel of channels) {
      await this.deliveryService.queue({
        userId,
        channel,
        type,
        template,
        data,
        priority: this.getPriority(type),
      });
    }
  }

  async notifyMany(
    type: NotificationType,
    userIds: string[],
    data: NotificationData
  ): Promise<void> {
    // Batch process
    for (const userId of userIds) {
      await this.notify(type, userId, data);
    }
  }

  private determineChannels(
    type: NotificationType,
    typePrefs: TypePreferences,
    globalPrefs: UserPreferences
  ): NotificationChannel[] {
    const channels: NotificationChannel[] = [];

    // Always include in-app
    channels.push('inapp');

    // Check email
    if (typePrefs.email !== false && globalPrefs.email.enabled) {
      channels.push('email');
    }

    // Check push
    if (typePrefs.push !== false && globalPrefs.push.enabled) {
      channels.push('push');
    }

    return channels;
  }

  private getPriority(type: NotificationType): number {
    const priorities: Record<NotificationType, number> = {
      'ticket:assigned': 1,
      'ticket:urgent': 1,
      'ticket:sla_warning': 1,
      'ticket:sla_breached': 1,
      'ticket:message': 2,
      'ticket:mentioned': 2,
      'ticket:resolved': 3,
      'system:announcement': 3,
      'digest:daily': 4,
      'digest:weekly': 5,
    };

    return priorities[type] || 3;
  }

  // User-facing methods
  async list(
    userId: string,
    options: ListOptions
  ): Promise<PaginatedResult<Notification>> {
    return this.notificationRepo.findByUser(userId, options);
  }

  async markRead(notificationId: string, userId: string): Promise<void> {
    await this.notificationRepo.markRead(notificationId, userId);
  }

  async markAllRead(userId: string): Promise<void> {
    await this.notificationRepo.markAllRead(userId);
  }

  async getUnreadCount(userId: string): Promise<number> {
    return this.notificationRepo.countUnread(userId);
  }
}
```

---

## Template System

### Template Service

```typescript
// services/template.service.ts
import Handlebars from 'handlebars';

export class TemplateService {
  private compiledTemplates: Map<string, CompiledTemplates> = new Map();

  constructor() {
    this.registerHelpers();
  }

  private registerHelpers(): void {
    Handlebars.registerHelper('formatDate', (date: Date, format: string) => {
      return dayjs(date).format(format);
    });

    Handlebars.registerHelper('truncate', (text: string, length: number) => {
      if (text.length <= length) return text;
      return text.substring(0, length) + '...';
    });

    Handlebars.registerHelper('priorityColor', (priority: string) => {
      const colors = {
        urgent: '#dc2626',
        high: '#ea580c',
        medium: '#ca8a04',
        low: '#16a34a',
      };
      return colors[priority] || '#6b7280';
    });
  }

  async get(type: NotificationType): Promise<NotificationTemplate> {
    // Check cache
    if (this.compiledTemplates.has(type)) {
      return this.compiledTemplates.get(type);
    }

    // Load from database
    const template = await prisma.notificationTemplate.findUnique({
      where: { type },
    });

    if (!template) {
      throw new NotFoundError(`Template not found: ${type}`);
    }

    // Compile templates
    const compiled = {
      type,
      subject: template.subject
        ? Handlebars.compile(template.subject)
        : null,
      email: {
        html: Handlebars.compile(template.emailHtml),
        text: Handlebars.compile(template.emailText),
      },
      push: {
        title: Handlebars.compile(template.pushTitle),
        body: Handlebars.compile(template.pushBody),
      },
      inapp: {
        title: Handlebars.compile(template.inappTitle),
        message: Handlebars.compile(template.inappMessage),
      },
    };

    this.compiledTemplates.set(type, compiled);

    return compiled;
  }

  render(
    template: CompiledTemplates,
    channel: NotificationChannel,
    data: NotificationData
  ): RenderedContent {
    const context = this.buildContext(data);

    switch (channel) {
      case 'email':
        return {
          subject: template.subject ? template.subject(context) : '',
          html: template.email.html(context),
          text: template.email.text(context),
        };

      case 'push':
        return {
          title: template.push.title(context),
          body: template.push.body(context),
        };

      case 'inapp':
        return {
          title: template.inapp.title(context),
          message: template.inapp.message(context),
        };

      default:
        throw new Error(`Unknown channel: ${channel}`);
    }
  }

  private buildContext(data: NotificationData): TemplateContext {
    return {
      ...data,
      appName: config.app.name,
      appUrl: config.app.url,
      supportEmail: config.email.support,
      year: new Date().getFullYear(),
    };
  }

  async invalidateCache(type: NotificationType): Promise<void> {
    this.compiledTemplates.delete(type);
  }
}
```

### Template Examples

```typescript
// Default templates
const defaultTemplates: NotificationTemplateInput[] = [
  {
    type: 'ticket:assigned',
    subject: 'New ticket assigned: {{ticket.subject}}',
    emailHtml: `
      <h2>New Ticket Assigned</h2>
      <p>You have been assigned a new ticket:</p>
      <table>
        <tr>
          <td><strong>Ticket:</strong></td>
          <td>{{ticket.ticketNumber}}</td>
        </tr>
        <tr>
          <td><strong>Subject:</strong></td>
          <td>{{ticket.subject}}</td>
        </tr>
        <tr>
          <td><strong>Priority:</strong></td>
          <td style="color: {{priorityColor ticket.priority}}">
            {{ticket.priority}}
          </td>
        </tr>
        <tr>
          <td><strong>Customer:</strong></td>
          <td>{{ticket.createdBy.name}}</td>
        </tr>
      </table>
      <p>
        <a href="{{appUrl}}/tickets/{{ticket.id}}">View Ticket</a>
      </p>
    `,
    emailText: `
New Ticket Assigned

Ticket: {{ticket.ticketNumber}}
Subject: {{ticket.subject}}
Priority: {{ticket.priority}}
Customer: {{ticket.createdBy.name}}

View ticket: {{appUrl}}/tickets/{{ticket.id}}
    `,
    pushTitle: 'New ticket: {{ticket.ticketNumber}}',
    pushBody: '{{truncate ticket.subject 50}}',
    inappTitle: 'Ticket Assigned',
    inappMessage: '{{ticket.ticketNumber}}: {{truncate ticket.subject 60}}',
  },
  {
    type: 'ticket:message',
    subject: 'New message on {{ticket.ticketNumber}}',
    emailHtml: `
      <h2>New Message</h2>
      <p>{{message.sender.name}} replied to ticket {{ticket.ticketNumber}}:</p>
      <blockquote>
        {{message.content}}
      </blockquote>
      <p>
        <a href="{{appUrl}}/tickets/{{ticket.id}}">View Conversation</a>
      </p>
    `,
    pushTitle: 'Reply: {{ticket.ticketNumber}}',
    pushBody: '{{message.sender.name}}: {{truncate message.content 40}}',
    inappTitle: 'New Reply',
    inappMessage: '{{message.sender.name}} replied to {{ticket.ticketNumber}}',
  },
];
```

---

## User Preferences

### Preferences Service

```typescript
// services/preferences.service.ts
export class PreferencesService {
  private readonly defaults: UserPreferences = {
    email: {
      enabled: true,
      digest: 'instant',
      digestTime: '09:00',
    },
    push: {
      enabled: true,
    },
    types: {
      'ticket:assigned': { email: true, push: true },
      'ticket:message': { email: true, push: true },
      'ticket:mentioned': { email: true, push: true },
      'ticket:sla_warning': { email: true, push: true },
      'ticket:resolved': { email: true, push: false },
      'system:announcement': { email: true, push: false },
    },
  };

  async get(userId: string): Promise<UserPreferences> {
    const stored = await this.preferencesRepo.findByUser(userId);

    if (!stored) {
      return this.defaults;
    }

    // Merge with defaults
    return this.mergeWithDefaults(stored);
  }

  async update(
    userId: string,
    updates: Partial<UserPreferences>
  ): Promise<UserPreferences> {
    const current = await this.get(userId);
    const merged = { ...current, ...updates };

    await this.preferencesRepo.upsert(userId, merged);

    return merged;
  }

  private mergeWithDefaults(stored: StoredPreferences): UserPreferences {
    return {
      email: { ...this.defaults.email, ...stored.email },
      push: { ...this.defaults.push, ...stored.push },
      types: { ...this.defaults.types, ...stored.types },
    };
  }
}
```

---

## Queue Processing

### Notification Worker

```typescript
// jobs/notification.worker.ts
import { Worker, Job } from 'bullmq';

export class NotificationWorker {
  private worker: Worker;

  constructor(
    private emailProvider: EmailProvider,
    private pushProvider: PushProvider,
    private inappProvider: InAppProvider,
    private templateService: TemplateService
  ) {
    this.worker = new Worker(
      'notifications',
      this.process.bind(this),
      {
        connection: redis,
        concurrency: 10,
        limiter: {
          max: 100,
          duration: 1000, // 100 per second
        },
      }
    );

    this.setupEventHandlers();
  }

  private async process(job: Job<NotificationJob>): Promise<void> {
    const { userId, channel, type, template, data } = job.data;

    // Render content
    const content = this.templateService.render(template, channel, data);

    // Get user info
    const user = await userService.findById(userId);

    // Send via appropriate provider
    let result: DeliveryResult;

    switch (channel) {
      case 'email':
        result = await this.emailProvider.send({
          id: job.id,
          to: user.email,
          ...content,
        });
        break;

      case 'push':
        const subscriptions = await this.pushProvider.getSubscriptions(userId);
        for (const subscription of subscriptions) {
          result = await this.pushProvider.send({
            id: job.id,
            userId,
            subscription,
            ...content,
          });
        }
        break;

      case 'inapp':
        result = await this.inappProvider.send({
          id: job.id,
          userId,
          type,
          ...content,
          data,
        });
        break;

      default:
        throw new Error(`Unknown channel: ${channel}`);
    }

    // Track delivery
    await this.trackDelivery(job.id, result);

    if (!result.success && result.retryable) {
      throw new Error(result.error); // Will trigger retry
    }
  }

  private setupEventHandlers(): void {
    this.worker.on('failed', async (job, error) => {
      logger.error('Notification delivery failed', {
        jobId: job?.id,
        attempts: job?.attemptsMade,
        error,
      });
    });

    this.worker.on('completed', async (job) => {
      logger.debug('Notification delivered', {
        jobId: job.id,
        channel: job.data.channel,
      });
    });
  }

  private async trackDelivery(
    jobId: string,
    result: DeliveryResult
  ): Promise<void> {
    await prisma.notificationDelivery.create({
      data: {
        jobId,
        channel: result.channel,
        success: result.success,
        providerId: result.providerId,
        error: result.error,
      },
    });
  }
}
```

### Digest Worker

```typescript
// jobs/digest.worker.ts
export class DigestWorker {
  private worker: Worker;

  constructor() {
    this.worker = new Worker(
      'digests',
      this.process.bind(this),
      { connection: redis }
    );

    // Schedule daily digests at 9 AM for each timezone
    this.scheduleDailyDigests();
  }

  private async process(job: Job<DigestJob>): Promise<void> {
    const { userId, period } = job.data;

    // Get user's unread notifications since last digest
    const notifications = await this.getDigestContent(userId, period);

    if (notifications.length === 0) {
      return; // Nothing to send
    }

    // Render digest email
    const content = await this.renderDigest(notifications, period);

    // Send email
    await emailProvider.send({
      id: job.id,
      to: user.email,
      subject: `Your ${period} digest - ${notifications.length} updates`,
      html: content.html,
      text: content.text,
    });

    // Mark as included in digest
    await this.markDigestSent(userId, notifications);
  }

  private async getDigestContent(
    userId: string,
    period: 'daily' | 'weekly'
  ): Promise<Notification[]> {
    const since = period === 'daily'
      ? dayjs().subtract(1, 'day').toDate()
      : dayjs().subtract(1, 'week').toDate();

    return prisma.notification.findMany({
      where: {
        userId,
        createdAt: { gte: since },
        digestedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private scheduleDailyDigests(): void {
    // Run every hour to catch different timezones
    queue.add(
      'check-digests',
      {},
      { repeat: { cron: '0 * * * *' } }
    );
  }
}
```

---

## Related Documents

- [API Reference](../../03-api/overview.md) — Notification endpoints
- [Real-time Module](../realtime/overview.md) — In-app notifications
- [Automation Module](../automation/overview.md) — Automated notifications

---

*Next: [Security Documentation →](../../05-security/overview.md)*
