# Release Planning

> Version planning and release strategy for InsightDesk.

## Table of Contents

1. [Versioning Strategy](#versioning-strategy)
2. [Release Schedule](#release-schedule)
3. [Version History](#version-history)
4. [Release Process](#release-process)
5. [Feature Flags](#feature-flags)
6. [Rollback Procedures](#rollback-procedures)

---

## Versioning Strategy

### Semantic Versioning

InsightDesk follows [Semantic Versioning 2.0.0](https://semver.org/):

```
MAJOR.MINOR.PATCH[-PRERELEASE]

Examples:
- 1.0.0       # Initial production release
- 1.1.0       # New features, backward compatible
- 1.1.1       # Bug fixes
- 2.0.0       # Breaking changes
- 1.2.0-beta  # Pre-release version
```

### Version Increments

| Change Type | Version Bump | Example |
|-------------|--------------|---------|
| Breaking API changes | MAJOR | 1.0.0 → 2.0.0 |
| New features (backward compatible) | MINOR | 1.0.0 → 1.1.0 |
| Bug fixes | PATCH | 1.0.0 → 1.0.1 |
| Pre-release | Suffix | 1.0.0 → 1.1.0-alpha.1 |

### Branch Strategy

```
main (production)
  │
  ├── release/1.0.0
  │     ├── hotfix/1.0.1
  │     └── hotfix/1.0.2
  │
  ├── release/1.1.0
  │
  └── develop
        ├── feature/ticket-automation
        ├── feature/ai-suggestions
        └── bugfix/login-issue
```

---

## Release Schedule

### Release Cadence

| Release Type | Frequency | Day | Time (UTC) |
|--------------|-----------|-----|------------|
| Major | Quarterly | Monday | 14:00 |
| Minor | Bi-weekly | Tuesday | 14:00 |
| Patch | As needed | Any | 14:00 |
| Hotfix | Emergency | Any | ASAP |

### Planned Releases

```
2024 Release Calendar
═════════════════════

Q1 2024
├── v0.1.0 - Alpha Release (Week 4)
│   └── Core authentication, basic tickets
├── v0.2.0 - Alpha Update (Week 6)
│   └── Knowledge base, search
├── v0.3.0 - Alpha Update (Week 8)
│   └── Real-time updates, notifications
└── v0.4.0 - Beta Release (Week 10)
    └── MVP complete, analytics dashboard

Q2 2024
├── v1.0.0 - Production Release (Week 12)
│   └── Full MVP, production hardened
├── v1.1.0 - Minor Release (Week 14)
│   └── Workflow automation basics
├── v1.2.0 - Minor Release (Week 16)
│   └── SLA management
└── v1.3.0 - Minor Release (Week 18)
    └── Advanced reporting

Q3 2024
├── v1.4.0 - Minor Release (Week 20)
│   └── AI suggestions integration
├── v1.5.0 - Minor Release (Week 22)
│   └── SAML SSO support
└── v2.0.0 - Major Release (Week 26)
    └── Multi-tenancy improvements, API v2
```

---

## Version History

### v0.x.x (Alpha)

#### v0.4.0 - Beta Release
**Release Date:** TBD  
**Status:** 🔄 In Development

**Features:**
- [ ] Analytics dashboard
- [ ] Performance optimizations
- [ ] Bug fixes from alpha feedback
- [ ] Documentation updates

**Breaking Changes:**
- None

---

#### v0.3.0 - Real-time Features
**Release Date:** TBD  
**Status:** 📅 Planned

**Features:**
- [ ] WebSocket infrastructure
- [ ] Live ticket updates
- [ ] Presence indicators
- [ ] In-app notifications

**Breaking Changes:**
- None

---

#### v0.2.0 - Knowledge Base
**Release Date:** TBD  
**Status:** 📅 Planned

**Features:**
- [ ] Article management
- [ ] Category hierarchy
- [ ] Full-text search
- [ ] Public portal

**Breaking Changes:**
- None

---

#### v0.1.0 - Initial Alpha
**Release Date:** TBD  
**Status:** 📅 Planned

**Features:**
- [ ] User authentication (register, login, logout)
- [ ] Organization management
- [ ] Basic ticket CRUD
- [ ] Comment system
- [ ] Role-based access control

**Breaking Changes:**
- N/A (Initial release)

---

### v1.x.x (Production)

#### v1.0.0 - Initial Production Release
**Release Date:** TBD  
**Status:** 📅 Planned

**Features:**
- Complete MVP feature set
- Production-grade security
- Performance optimizations
- Comprehensive documentation

**Migration Guide:**
- Fresh installation required
- No migration from alpha versions

---

## Release Process

### Pre-Release Checklist

```markdown
## Release Checklist - v{VERSION}

### Code Freeze
- [ ] Feature freeze date: ____
- [ ] All PRs merged to release branch
- [ ] No pending critical bugs

### Testing
- [ ] Unit tests passing (>80% coverage)
- [ ] Integration tests passing
- [ ] E2E tests passing
- [ ] Manual QA sign-off
- [ ] Load testing completed
- [ ] Security scan completed

### Documentation
- [ ] API documentation updated
- [ ] Changelog updated
- [ ] Migration guide (if needed)
- [ ] Release notes drafted

### Staging Deployment
- [ ] Deployed to staging
- [ ] Smoke tests passing
- [ ] Performance verified
- [ ] Stakeholder sign-off

### Production Deployment
- [ ] Deployment window scheduled
- [ ] On-call team notified
- [ ] Rollback plan ready
- [ ] Monitoring dashboards ready
```

### Release Steps

```bash
# 1. Create release branch
git checkout develop
git pull origin develop
git checkout -b release/1.2.0

# 2. Update version
bun run version:bump 1.2.0
# Updates package.json, CHANGELOG.md

# 3. Run final tests
bun run test
bun run test:e2e
bun run lint

# 4. Create release PR
git push origin release/1.2.0
# Create PR: release/1.2.0 → main

# 5. After approval and merge
git checkout main
git pull origin main
git tag v1.2.0
git push origin v1.2.0

# 6. Merge back to develop
git checkout develop
git merge main
git push origin develop
```

### Deployment Pipeline

```yaml
# .github/workflows/release.yml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Bun
        uses: oven-sh/setup-bun@v1
      
      - name: Install dependencies
        run: bun install
      
      - name: Run tests
        run: |
          bun run test
          bun run test:e2e
      
      - name: Build
        run: bun run build
      
      - name: Build Docker images
        run: |
          docker build -t insightdesk/api:${{ github.ref_name }} ./backend
          docker build -t insightdesk/web:${{ github.ref_name }} ./frontend
      
      - name: Push to registry
        run: |
          docker push insightdesk/api:${{ github.ref_name }}
          docker push insightdesk/web:${{ github.ref_name }}
      
      - name: Deploy to production
        run: |
          kubectl set image deployment/api api=insightdesk/api:${{ github.ref_name }}
          kubectl set image deployment/web web=insightdesk/web:${{ github.ref_name }}
          kubectl rollout status deployment/api
          kubectl rollout status deployment/web
      
      - name: Create GitHub Release
        uses: actions/create-release@v1
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          tag_name: ${{ github.ref_name }}
          release_name: Release ${{ github.ref_name }}
          body_path: CHANGELOG.md
          draft: false
          prerelease: ${{ contains(github.ref_name, 'alpha') || contains(github.ref_name, 'beta') }}
```

---

## Feature Flags

### Flag Configuration

```typescript
// lib/feature-flags.ts
export interface FeatureFlags {
  // Beta features
  aiSuggestions: boolean;
  workflowAutomation: boolean;
  advancedReporting: boolean;
  
  // Experimental
  chatbot: boolean;
  voiceIntegration: boolean;
  
  // Rollout
  newDashboard: boolean;
  darkModeV2: boolean;
}

export const defaultFlags: FeatureFlags = {
  aiSuggestions: false,
  workflowAutomation: false,
  advancedReporting: false,
  chatbot: false,
  voiceIntegration: false,
  newDashboard: false,
  darkModeV2: false,
};

// Feature flag service
class FeatureFlagService {
  private flags: Map<string, FeatureFlags> = new Map();

  async getFlags(organizationId: string): Promise<FeatureFlags> {
    // Check cache
    if (this.flags.has(organizationId)) {
      return this.flags.get(organizationId)!;
    }

    // Fetch from database/config
    const orgFlags = await prisma.featureFlag.findMany({
      where: { organizationId },
    });

    const flags: FeatureFlags = { ...defaultFlags };
    for (const flag of orgFlags) {
      if (flag.name in flags) {
        flags[flag.name as keyof FeatureFlags] = flag.enabled;
      }
    }

    this.flags.set(organizationId, flags);
    return flags;
  }

  isEnabled(flags: FeatureFlags, feature: keyof FeatureFlags): boolean {
    return flags[feature] ?? false;
  }
}

export const featureFlags = new FeatureFlagService();
```

### Gradual Rollout

```typescript
// lib/rollout.ts
export interface RolloutConfig {
  feature: string;
  percentage: number;
  allowlist: string[];
  blocklist: string[];
}

export function shouldEnableFeature(
  config: RolloutConfig,
  organizationId: string
): boolean {
  // Check blocklist first
  if (config.blocklist.includes(organizationId)) {
    return false;
  }

  // Check allowlist
  if (config.allowlist.includes(organizationId)) {
    return true;
  }

  // Percentage-based rollout
  const hash = hashCode(organizationId);
  return (hash % 100) < config.percentage;
}

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}
```

### Usage in Components

```tsx
// components/Dashboard.tsx
'use client';

import { useFeatureFlags } from '@/hooks/useFeatureFlags';

export function Dashboard() {
  const { flags, isEnabled } = useFeatureFlags();

  return (
    <div>
      <h1>Dashboard</h1>
      
      {isEnabled('newDashboard') ? (
        <NewDashboardLayout />
      ) : (
        <LegacyDashboardLayout />
      )}
      
      {isEnabled('aiSuggestions') && (
        <AISuggestionsPanel />
      )}
    </div>
  );
}
```

---

## Rollback Procedures

### Automatic Rollback Triggers

```yaml
# Deployment with automatic rollback
apiVersion: argoproj.io/v1alpha1
kind: Rollout
metadata:
  name: insightdesk-api
spec:
  replicas: 3
  strategy:
    canary:
      steps:
        - setWeight: 10
        - pause: { duration: 5m }
        - setWeight: 30
        - pause: { duration: 5m }
        - setWeight: 60
        - pause: { duration: 5m }
        - setWeight: 100
      analysis:
        templates:
          - templateName: success-rate
        startingStep: 1
  template:
    spec:
      containers:
        - name: api
          image: insightdesk/api:latest
---
apiVersion: argoproj.io/v1alpha1
kind: AnalysisTemplate
metadata:
  name: success-rate
spec:
  metrics:
    - name: success-rate
      interval: 1m
      successCondition: result[0] >= 0.99
      failureLimit: 3
      provider:
        prometheus:
          address: http://prometheus:9090
          query: |
            sum(rate(http_requests_total{status=~"2.."}[5m])) /
            sum(rate(http_requests_total[5m]))
```

### Manual Rollback Steps

```bash
# 1. Identify the issue
kubectl logs -l app=insightdesk-api --tail=100

# 2. Quick rollback to previous deployment
kubectl rollout undo deployment/insightdesk-api
kubectl rollout undo deployment/insightdesk-web

# 3. Verify rollback
kubectl rollout status deployment/insightdesk-api
kubectl get pods -l app=insightdesk-api

# 4. Or rollback to specific version
kubectl rollout undo deployment/insightdesk-api --to-revision=5

# 5. Database migration rollback (if needed)
bun run prisma migrate resolve --rolled-back "20240115_migration_name"
```

### Rollback Checklist

```markdown
## Rollback Checklist

### Immediate Actions
- [ ] Identify failure (error logs, alerts)
- [ ] Decision to rollback made
- [ ] Notify team via Slack/PagerDuty

### Rollback Execution
- [ ] Execute rollback command
- [ ] Verify pods are healthy
- [ ] Check error rates dropping
- [ ] Verify user-facing functionality

### Database (if applicable)
- [ ] Check if migration is reversible
- [ ] Run down migration if needed
- [ ] Verify data integrity

### Post-Rollback
- [ ] Notify stakeholders
- [ ] Create incident report
- [ ] Schedule root cause analysis
- [ ] Plan fix for next release
```

### Emergency Contacts

| Role | Contact | Responsibility |
|------|---------|----------------|
| On-call Engineer | PagerDuty | First response |
| Backend Lead | @backend-lead | API issues |
| Frontend Lead | @frontend-lead | UI issues |
| DevOps Lead | @devops-lead | Infrastructure |
| Product Owner | @product-owner | Business decisions |
