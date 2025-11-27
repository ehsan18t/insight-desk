# Automation Module

> Workflow automation, triggers, actions, and SLA management

---

## Table of Contents

- [Overview](#overview)
- [Directory Structure](#directory-structure)
- [Automation Engine](#automation-engine)
- [Trigger System](#trigger-system)
- [Action Execution](#action-execution)
- [Macro System](#macro-system)
- [Scheduling](#scheduling)

---

## Overview

The Automation module provides:

- Rule-based workflow automation
- Event triggers and conditions
- Configurable action execution
- Reusable macro definitions
- SLA policy management
- Scheduled job execution

---

## Directory Structure

```
modules/automation/
├── controllers/
│   ├── automation.controller.ts
│   ├── macro.controller.ts
│   ├── sla.controller.ts
│   └── schedule.controller.ts
├── services/
│   ├── automation.service.ts    # Rule management
│   ├── engine.service.ts        # Rule execution
│   ├── trigger.service.ts       # Trigger handling
│   ├── action.service.ts        # Action execution
│   ├── condition.service.ts     # Condition evaluation
│   ├── macro.service.ts         # Macro operations
│   ├── sla.service.ts           # SLA management
│   └── scheduler.service.ts     # Job scheduling
├── repositories/
│   ├── automation.repository.ts
│   ├── macro.repository.ts
│   └── sla.repository.ts
├── triggers/
│   ├── ticket.triggers.ts
│   ├── user.triggers.ts
│   └── schedule.triggers.ts
├── actions/
│   ├── ticket.actions.ts
│   ├── notification.actions.ts
│   └── webhook.actions.ts
├── jobs/
│   ├── scheduler.job.ts
│   └── sla-monitor.job.ts
├── types/
│   └── automation.types.ts
└── index.ts
```

---

## Automation Engine

### Engine Service

```typescript
// services/engine.service.ts
export class AutomationEngine {
  constructor(
    private automationRepo: AutomationRepository,
    private conditionService: ConditionService,
    private actionService: ActionService
  ) {}

  async processEvent(
    eventType: string,
    payload: EventPayload
  ): Promise<ExecutionResult[]> {
    // Get active rules for this event type
    const rules = await this.automationRepo.findByTrigger(eventType);

    const results: ExecutionResult[] = [];

    // Sort by priority
    const sortedRules = rules.sort((a, b) => a.priority - b.priority);

    for (const rule of sortedRules) {
      try {
        const result = await this.executeRule(rule, payload);
        results.push(result);

        // Check for stopping condition
        if (result.shouldStop) {
          break;
        }
      } catch (error) {
        logger.error('Rule execution failed', {
          ruleId: rule.id,
          eventType,
          error,
        });

        results.push({
          ruleId: rule.id,
          status: 'failed',
          error: error.message,
        });
      }
    }

    return results;
  }

  private async executeRule(
    rule: AutomationRule,
    payload: EventPayload
  ): Promise<ExecutionResult> {
    const startTime = Date.now();

    // Check rate limiting
    if (rule.rateLimiting) {
      const canExecute = await this.checkRateLimit(rule);
      if (!canExecute) {
        return {
          ruleId: rule.id,
          status: 'skipped',
          reason: 'rate_limited',
        };
      }
    }

    // Evaluate conditions
    const conditionsMatch = await this.conditionService.evaluate(
      rule.conditions,
      rule.conditionLogic,
      payload
    );

    if (!conditionsMatch) {
      return {
        ruleId: rule.id,
        status: 'skipped',
        reason: 'conditions_not_met',
      };
    }

    // Execute actions
    const actionResults = await this.actionService.executeAll(
      rule.actions,
      payload
    );

    const executionTime = Date.now() - startTime;

    // Log execution
    await this.logExecution(rule, payload, actionResults, executionTime);

    return {
      ruleId: rule.id,
      status: 'success',
      actionsExecuted: actionResults,
      executionTimeMs: executionTime,
    };
  }

  private async checkRateLimit(rule: AutomationRule): Promise<boolean> {
    const key = `automation:ratelimit:${rule.id}`;
    const current = await this.redis.incr(key);

    if (current === 1) {
      await this.redis.expire(key, rule.rateLimiting.windowMinutes * 60);
    }

    return current <= rule.rateLimiting.maxExecutions;
  }

  private async logExecution(
    rule: AutomationRule,
    payload: EventPayload,
    results: ActionResult[],
    executionTime: number
  ): Promise<void> {
    await this.prisma.automationLog.create({
      data: {
        automationId: rule.id,
        triggerId: payload.ticketId || payload.userId,
        triggerType: payload.type,
        status: results.every((r) => r.success) ? 'success' : 'partial',
        actionsExecuted: results,
        executionTimeMs: executionTime,
      },
    });
  }
}
```

---

## Trigger System

### Event Listener Setup

```typescript
// triggers/ticket.triggers.ts
export function registerTicketTriggers(engine: AutomationEngine): void {
  // Ticket created
  eventEmitter.on('ticket:created', async ({ ticket, user }) => {
    await engine.processEvent('ticket.created', {
      type: 'ticket',
      ticketId: ticket.id,
      ticket,
      user,
    });
  });

  // Ticket updated
  eventEmitter.on('ticket:updated', async ({ ticket, changes, user }) => {
    await engine.processEvent('ticket.updated', {
      type: 'ticket',
      ticketId: ticket.id,
      ticket,
      changes,
      user,
    });

    // Fire specific change events
    for (const change of changes) {
      await engine.processEvent(`ticket.${change.field}_changed`, {
        type: 'ticket',
        ticketId: ticket.id,
        ticket,
        field: change.field,
        oldValue: change.oldValue,
        newValue: change.newValue,
        user,
      });
    }
  });

  // Ticket message
  eventEmitter.on('ticket:message', async ({ message, ticket, isFirstResponse }) => {
    await engine.processEvent('ticket.message_added', {
      type: 'ticket',
      ticketId: ticket.id,
      ticket,
      message,
      isFirstResponse,
    });

    if (isFirstResponse) {
      await engine.processEvent('ticket.first_response', {
        type: 'ticket',
        ticketId: ticket.id,
        ticket,
        message,
      });
    }
  });

  // SLA events
  eventEmitter.on('ticket:sla:warning', async ({ ticket, minutesRemaining }) => {
    await engine.processEvent('ticket.sla_warning', {
      type: 'ticket',
      ticketId: ticket.id,
      ticket,
      minutesRemaining,
    });
  });

  eventEmitter.on('ticket:sla:breached', async ({ ticket }) => {
    await engine.processEvent('ticket.sla_breached', {
      type: 'ticket',
      ticketId: ticket.id,
      ticket,
    });
  });
}
```

---

## Condition Evaluation

### Condition Service

```typescript
// services/condition.service.ts
export class ConditionService {
  async evaluate(
    conditions: Condition[],
    logic: 'all' | 'any',
    payload: EventPayload
  ): Promise<boolean> {
    if (conditions.length === 0) return true;

    const results = await Promise.all(
      conditions.map((c) => this.evaluateCondition(c, payload))
    );

    return logic === 'all'
      ? results.every(Boolean)
      : results.some(Boolean);
  }

  private async evaluateCondition(
    condition: Condition,
    payload: EventPayload
  ): Promise<boolean> {
    const value = this.getFieldValue(condition.field, payload);
    const targetValue = condition.value;

    switch (condition.operator) {
      case 'equals':
        return value === targetValue;

      case 'not_equals':
        return value !== targetValue;

      case 'contains':
        return String(value).toLowerCase().includes(
          String(targetValue).toLowerCase()
        );

      case 'not_contains':
        return !String(value).toLowerCase().includes(
          String(targetValue).toLowerCase()
        );

      case 'starts_with':
        return String(value).toLowerCase().startsWith(
          String(targetValue).toLowerCase()
        );

      case 'ends_with':
        return String(value).toLowerCase().endsWith(
          String(targetValue).toLowerCase()
        );

      case 'in':
        return Array.isArray(targetValue) && targetValue.includes(value);

      case 'not_in':
        return Array.isArray(targetValue) && !targetValue.includes(value);

      case 'greater_than':
        return Number(value) > Number(targetValue);

      case 'less_than':
        return Number(value) < Number(targetValue);

      case 'is_set':
        return value !== null && value !== undefined;

      case 'is_not_set':
        return value === null || value === undefined;

      case 'matches_regex':
        return new RegExp(targetValue).test(String(value));

      default:
        logger.warn(`Unknown operator: ${condition.operator}`);
        return false;
    }
  }

  private getFieldValue(field: string, payload: EventPayload): any {
    const parts = field.split('.');
    let value: any = payload.ticket || payload.user || payload;

    for (const part of parts) {
      if (value === null || value === undefined) return undefined;

      // Handle array access
      if (part.startsWith('[') && part.endsWith(']')) {
        const index = parseInt(part.slice(1, -1));
        value = value[index];
      } else {
        value = value[part];
      }
    }

    return value;
  }
}
```

---

## Action Execution

### Action Service

```typescript
// services/action.service.ts
export class ActionService {
  private actions: Map<string, ActionHandler> = new Map();

  constructor() {
    this.registerActions();
  }

  private registerActions(): void {
    // Ticket actions
    this.actions.set('set_priority', this.setPriority.bind(this));
    this.actions.set('set_status', this.setStatus.bind(this));
    this.actions.set('assign_agent', this.assignAgent.bind(this));
    this.actions.set('assign_team', this.assignTeam.bind(this));
    this.actions.set('add_tag', this.addTag.bind(this));
    this.actions.set('remove_tag', this.removeTag.bind(this));
    this.actions.set('add_note', this.addNote.bind(this));
    this.actions.set('send_reply', this.sendReply.bind(this));

    // Notification actions
    this.actions.set('send_email', this.sendEmail.bind(this));
    this.actions.set('send_notification', this.sendNotification.bind(this));
    this.actions.set('send_slack', this.sendSlack.bind(this));
    this.actions.set('send_webhook', this.sendWebhook.bind(this));

    // Control actions
    this.actions.set('delay', this.delay.bind(this));
  }

  async executeAll(
    actions: Action[],
    payload: EventPayload
  ): Promise<ActionResult[]> {
    const results: ActionResult[] = [];

    for (const action of actions) {
      try {
        await this.execute(action, payload);
        results.push({ type: action.type, status: 'success' });
      } catch (error) {
        results.push({
          type: action.type,
          status: 'failed',
          error: error.message,
        });

        // Stop on failure by default
        if (!action.continueOnError) {
          break;
        }
      }
    }

    return results;
  }

  private async execute(action: Action, payload: EventPayload): Promise<void> {
    const handler = this.actions.get(action.type);

    if (!handler) {
      throw new Error(`Unknown action type: ${action.type}`);
    }

    // Interpolate parameters
    const params = this.interpolateParams(action.params, payload);

    await handler(params, payload);
  }

  private interpolateParams(
    params: Record<string, any>,
    payload: EventPayload
  ): Record<string, any> {
    const result: Record<string, any> = {};

    for (const [key, value] of Object.entries(params)) {
      if (typeof value === 'string') {
        result[key] = this.interpolateString(value, payload);
      } else {
        result[key] = value;
      }
    }

    return result;
  }

  private interpolateString(template: string, payload: EventPayload): string {
    return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (match, path) => {
      const value = this.getNestedValue(path, payload);
      return value !== undefined ? String(value) : match;
    });
  }

  // Action implementations
  private async setPriority(
    params: { priority: string },
    payload: EventPayload
  ): Promise<void> {
    await ticketService.update(payload.ticketId, {
      priority: params.priority,
    });
  }

  private async assignAgent(
    params: { agentId: string },
    payload: EventPayload
  ): Promise<void> {
    await assignmentService.manualAssign(
      payload.ticketId,
      params.agentId,
      { id: 'system', role: 'system' }
    );
  }

  private async sendSlack(
    params: { channel: string; message: string },
    payload: EventPayload
  ): Promise<void> {
    await slackService.sendMessage(params.channel, params.message);
  }

  private async sendWebhook(
    params: { url: string; method?: string; headers?: object; body?: object },
    payload: EventPayload
  ): Promise<void> {
    await fetch(params.url, {
      method: params.method || 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...params.headers,
      },
      body: JSON.stringify(params.body || payload),
    });
  }

  private async delay(
    params: { minutes: number },
    payload: EventPayload
  ): Promise<void> {
    await sleep(params.minutes * 60 * 1000);
  }
}
```

---

## Macro System

### Macro Service

```typescript
// services/macro.service.ts
export class MacroService {
  async create(data: CreateMacroInput, user: User): Promise<Macro> {
    const macro = await this.macroRepo.create({
      name: data.name,
      description: data.description,
      category: data.category,
      availableFor: data.availableFor || ['agent', 'admin'],
      actions: data.actions,
      createdById: user.id,
    });

    eventEmitter.emit('automation:macro:created', { macro, user });

    return macro;
  }

  async apply(
    ticketId: string,
    macroId: string,
    user: User
  ): Promise<MacroResult> {
    const macro = await this.macroRepo.findById(macroId);

    if (!macro) {
      throw new NotFoundError('Macro not found');
    }

    // Check permission
    if (!macro.availableFor.includes(user.role)) {
      throw new ForbiddenError('Macro not available for your role');
    }

    const ticket = await ticketService.findById(ticketId);

    // Execute actions
    const results = await actionService.executeAll(macro.actions, {
      type: 'ticket',
      ticketId,
      ticket,
      user,
    });

    // Track usage
    await this.macroRepo.incrementUsage(macroId);

    // Log
    eventEmitter.emit('automation:macro:applied', {
      macro,
      ticketId,
      results,
      user,
    });

    return {
      macroId,
      ticketId,
      actionsExecuted: results,
    };
  }

  async list(user: User): Promise<Macro[]> {
    return this.macroRepo.findAvailableFor(user.role);
  }
}
```

---

## Scheduling

### Scheduler Service

```typescript
// services/scheduler.service.ts
import { Queue, Worker } from 'bullmq';

export class SchedulerService {
  private queue: Queue;
  private worker: Worker;

  constructor() {
    this.queue = new Queue('scheduled-jobs', {
      connection: redis,
    });

    this.setupWorker();
  }

  private setupWorker(): void {
    this.worker = new Worker(
      'scheduled-jobs',
      async (job) => {
        const { scheduledJobId } = job.data;

        const scheduledJob = await this.jobRepo.findById(scheduledJobId);
        if (!scheduledJob || !scheduledJob.enabled) {
          return;
        }

        try {
          await this.executeJob(scheduledJob);

          await this.jobRepo.update(scheduledJobId, {
            lastRunAt: new Date(),
            lastRunStatus: 'success',
          });
        } catch (error) {
          await this.jobRepo.update(scheduledJobId, {
            lastRunAt: new Date(),
            lastRunStatus: 'failed',
            lastRunError: error.message,
          });
        }
      },
      { connection: redis }
    );
  }

  async scheduleJob(job: ScheduledJob): Promise<void> {
    const cronExpression = this.buildCronExpression(job.schedule);

    await this.queue.add(
      `job:${job.id}`,
      { scheduledJobId: job.id },
      {
        repeat: {
          pattern: cronExpression,
          tz: job.schedule.timezone,
        },
        jobId: job.id,
      }
    );

    // Calculate next run
    const nextRun = this.calculateNextRun(cronExpression, job.schedule.timezone);
    await this.jobRepo.update(job.id, { nextRunAt: nextRun });
  }

  async unscheduleJob(jobId: string): Promise<void> {
    await this.queue.removeRepeatableByKey(`job:${jobId}`);
  }

  private async executeJob(job: ScheduledJob): Promise<void> {
    switch (job.job.type) {
      case 'query_and_action':
        await this.executeQueryAndAction(job.job);
        break;

      case 'run_automation':
        await this.runAutomation(job.job.automationId);
        break;

      case 'custom_script':
        await this.runCustomScript(job.job.scriptId, job.job.params);
        break;

      default:
        throw new Error(`Unknown job type: ${job.job.type}`);
    }
  }

  private async executeQueryAndAction(config: QueryAndActionConfig): Promise<void> {
    // Find matching tickets
    const tickets = await ticketService.search(config.query);

    // Execute actions on each
    for (const ticket of tickets) {
      await actionService.executeAll(config.actions, {
        type: 'ticket',
        ticketId: ticket.id,
        ticket,
      });
    }
  }

  private buildCronExpression(schedule: Schedule): string {
    switch (schedule.type) {
      case 'hourly':
        return `${schedule.minute || 0} * * * *`;
      case 'daily':
        return `${schedule.minute || 0} ${schedule.hour || 9} * * *`;
      case 'weekly':
        return `${schedule.minute || 0} ${schedule.hour || 9} * * ${schedule.dayOfWeek || 1}`;
      case 'cron':
        return schedule.expression;
      default:
        throw new Error(`Unknown schedule type: ${schedule.type}`);
    }
  }
}
```

---

## Related Documents

- [Automation API](../../03-api/automation.md) — API endpoints
- [Tickets Module](../tickets/overview.md) — Ticket automation targets
- [Notifications Module](../notifications/overview.md) — Notification actions

---

*Next: [Notifications Module →](../notifications/overview.md)*
