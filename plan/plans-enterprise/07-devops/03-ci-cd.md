# CI/CD Pipelines

> GitHub Actions workflows for automated testing, building, and deployment.

## Table of Contents

1. [Pipeline Overview](#pipeline-overview)
2. [Main CI Workflow](#main-ci-workflow)
3. [Pull Request Workflow](#pull-request-workflow)
4. [Release Workflow](#release-workflow)
5. [Scheduled Workflows](#scheduled-workflows)
6. [Reusable Workflows](#reusable-workflows)
7. [Secrets Management](#secrets-management)

---

## Pipeline Overview

### Workflow Structure

```
.github/
├── workflows/
│   ├── ci.yml              # Main CI pipeline
│   ├── pr.yml              # Pull request checks
│   ├── release.yml         # Production release
│   ├── staging.yml         # Staging deployment
│   ├── security.yml        # Security scanning
│   ├── scheduled.yml       # Scheduled maintenance
│   └── reusable/
│       ├── test.yml        # Reusable test workflow
│       ├── build.yml       # Reusable build workflow
│       └── deploy.yml      # Reusable deploy workflow
├── actions/
│   └── setup-bun/
│       └── action.yml      # Custom action for Bun setup
└── dependabot.yml          # Dependency updates
```

### Pipeline Triggers

| Event | Workflow | Purpose |
|-------|----------|---------|
| Push to `main` | ci.yml → staging.yml | Deploy to staging |
| Pull request | pr.yml | Run tests and checks |
| Tag `v*` | release.yml | Production release |
| Schedule (daily) | security.yml | Security scans |
| Manual | Any | Manual trigger option |

---

## Main CI Workflow

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

env:
  BUN_VERSION: '1.0.25'
  NODE_VERSION: '20'

jobs:
  # Lint and type check
  lint:
    name: Lint & Type Check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Bun
        uses: oven-sh/setup-bun@v1
        with:
          bun-version: ${{ env.BUN_VERSION }}

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Run ESLint
        run: bun run lint

      - name: Run TypeScript check
        run: bun run type-check

      - name: Run Prettier check
        run: bun run format:check

  # Unit and integration tests
  test:
    name: Test
    runs-on: ubuntu-latest
    needs: lint
    
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: insightdesk_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
      
      valkey:
        image: valkey/valkey:7-alpine
        ports:
          - 6379:6379
        options: >-
          --health-cmd "valkey-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v4

      - name: Setup Bun
        uses: oven-sh/setup-bun@v1
        with:
          bun-version: ${{ env.BUN_VERSION }}

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Generate Prisma client
        run: bunx prisma generate

      - name: Run database migrations
        run: bunx prisma migrate deploy
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/insightdesk_test

      - name: Run unit tests
        run: bun run test:unit
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/insightdesk_test
          VALKEY_URL: redis://localhost:6379

      - name: Run integration tests
        run: bun run test:integration
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/insightdesk_test
          VALKEY_URL: redis://localhost:6379

      - name: Upload coverage
        uses: codecov/codecov-action@v4
        with:
          token: ${{ secrets.CODECOV_TOKEN }}
          files: ./coverage/lcov.info
          fail_ci_if_error: false

  # Build Docker images
  build:
    name: Build
    runs-on: ubuntu-latest
    needs: test
    if: github.event_name == 'push'
    
    permissions:
      contents: read
      packages: write
    
    strategy:
      matrix:
        app: [api, web, worker]

    steps:
      - uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Login to GitHub Container Registry
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ghcr.io/${{ github.repository }}-${{ matrix.app }}
          tags: |
            type=ref,event=branch
            type=sha,prefix=
            type=raw,value=latest,enable=${{ github.ref == 'refs/heads/main' }}

      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          context: .
          file: docker/Dockerfile.${{ matrix.app }}
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  # Deploy to staging on main branch
  deploy-staging:
    name: Deploy to Staging
    runs-on: ubuntu-latest
    needs: build
    if: github.ref == 'refs/heads/main'
    environment: staging

    steps:
      - uses: actions/checkout@v4

      - name: Deploy to staging
        uses: ./.github/actions/deploy
        with:
          environment: staging
          image-tag: ${{ github.sha }}
          ssh-key: ${{ secrets.STAGING_SSH_KEY }}
          host: ${{ secrets.STAGING_HOST }}
```

---

## Pull Request Workflow

```yaml
# .github/workflows/pr.yml
name: Pull Request

on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  # Quick validation
  validate:
    name: Validate
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Bun
        uses: oven-sh/setup-bun@v1
        with:
          bun-version: '1.0.25'

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Lint
        run: bun run lint

      - name: Type check
        run: bun run type-check

      - name: Format check
        run: bun run format:check

  # Run tests
  test:
    name: Test
    runs-on: ubuntu-latest
    needs: validate
    
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: insightdesk_test
        ports:
          - 5432:5432
        options: --health-cmd pg_isready --health-interval 10s --health-timeout 5s --health-retries 5
      
      valkey:
        image: valkey/valkey:7-alpine
        ports:
          - 6379:6379

    steps:
      - uses: actions/checkout@v4

      - name: Setup Bun
        uses: oven-sh/setup-bun@v1

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Setup database
        run: |
          bunx prisma generate
          bunx prisma migrate deploy
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/insightdesk_test

      - name: Run tests
        run: bun run test:ci
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/insightdesk_test
          VALKEY_URL: redis://localhost:6379

  # Build check (no push)
  build-check:
    name: Build Check
    runs-on: ubuntu-latest
    needs: validate
    
    strategy:
      matrix:
        app: [api, web]

    steps:
      - uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Build image
        uses: docker/build-push-action@v5
        with:
          context: .
          file: docker/Dockerfile.${{ matrix.app }}
          push: false
          cache-from: type=gha
          cache-to: type=gha,mode=max

  # Preview deployment (optional)
  preview:
    name: Preview Deployment
    runs-on: ubuntu-latest
    needs: [test, build-check]
    if: github.event.pull_request.head.repo.full_name == github.repository
    environment:
      name: preview
      url: ${{ steps.deploy.outputs.url }}

    steps:
      - uses: actions/checkout@v4

      - name: Deploy preview
        id: deploy
        run: |
          # Deploy to preview environment (e.g., Vercel, Railway)
          echo "url=https://pr-${{ github.event.number }}.preview.insightdesk.io" >> $GITHUB_OUTPUT

      - name: Comment PR
        uses: actions/github-script@v7
        with:
          script: |
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: '🚀 Preview deployed: ${{ steps.deploy.outputs.url }}'
            })
```

---

## Release Workflow

```yaml
# .github/workflows/release.yml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  # Validate tag
  validate:
    name: Validate Release
    runs-on: ubuntu-latest
    outputs:
      version: ${{ steps.version.outputs.version }}
    steps:
      - uses: actions/checkout@v4

      - name: Extract version
        id: version
        run: echo "version=${GITHUB_REF#refs/tags/v}" >> $GITHUB_OUTPUT

      - name: Validate version format
        run: |
          if ! echo "${{ steps.version.outputs.version }}" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?$'; then
            echo "Invalid version format"
            exit 1
          fi

  # Run full test suite
  test:
    name: Test Suite
    runs-on: ubuntu-latest
    needs: validate
    
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: insightdesk_test
        ports:
          - 5432:5432
        options: --health-cmd pg_isready --health-interval 10s
      
      valkey:
        image: valkey/valkey:7-alpine
        ports:
          - 6379:6379

    steps:
      - uses: actions/checkout@v4

      - name: Setup Bun
        uses: oven-sh/setup-bun@v1

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Run all tests
        run: bun run test:all
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/insightdesk_test
          VALKEY_URL: redis://localhost:6379

  # Build and push production images
  build:
    name: Build Production Images
    runs-on: ubuntu-latest
    needs: test
    
    permissions:
      contents: read
      packages: write
    
    strategy:
      matrix:
        app: [api, web, worker]

    steps:
      - uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Login to GHCR
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          context: .
          file: docker/Dockerfile.${{ matrix.app }}
          push: true
          tags: |
            ghcr.io/${{ github.repository }}-${{ matrix.app }}:${{ needs.validate.outputs.version }}
            ghcr.io/${{ github.repository }}-${{ matrix.app }}:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max
          build-args: |
            VERSION=${{ needs.validate.outputs.version }}

  # Deploy to production
  deploy:
    name: Deploy to Production
    runs-on: ubuntu-latest
    needs: [validate, build]
    environment: production
    
    steps:
      - uses: actions/checkout@v4

      - name: Run database migrations
        run: |
          # SSH to production and run migrations
          echo "Running migrations..."
        env:
          DATABASE_URL: ${{ secrets.PRODUCTION_DATABASE_URL }}

      - name: Deploy to production
        run: |
          # Deploy using Docker Swarm, K8s, or cloud provider
          echo "Deploying version ${{ needs.validate.outputs.version }}..."
        env:
          DEPLOY_TOKEN: ${{ secrets.DEPLOY_TOKEN }}

      - name: Health check
        run: |
          sleep 30
          curl -f https://app.insightdesk.io/health || exit 1

      - name: Notify deployment
        uses: slackapi/slack-github-action@v1
        with:
          payload: |
            {
              "text": "🚀 InsightDesk v${{ needs.validate.outputs.version }} deployed to production"
            }
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK }}

  # Create GitHub release
  release:
    name: Create Release
    runs-on: ubuntu-latest
    needs: [validate, deploy]
    permissions:
      contents: write
    
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Generate changelog
        id: changelog
        run: |
          # Generate changelog from commits
          echo "changelog<<EOF" >> $GITHUB_OUTPUT
          git log $(git describe --tags --abbrev=0 HEAD^)..HEAD --pretty=format:"- %s" >> $GITHUB_OUTPUT
          echo "EOF" >> $GITHUB_OUTPUT

      - name: Create release
        uses: ncipollo/release-action@v1
        with:
          tag: v${{ needs.validate.outputs.version }}
          name: Release v${{ needs.validate.outputs.version }}
          body: |
            ## What's Changed
            ${{ steps.changelog.outputs.changelog }}
            
            ## Docker Images
            ```
            docker pull ghcr.io/${{ github.repository }}-api:${{ needs.validate.outputs.version }}
            docker pull ghcr.io/${{ github.repository }}-web:${{ needs.validate.outputs.version }}
            docker pull ghcr.io/${{ github.repository }}-worker:${{ needs.validate.outputs.version }}
            ```
          draft: false
          prerelease: ${{ contains(needs.validate.outputs.version, '-') }}
```

---

## Scheduled Workflows

```yaml
# .github/workflows/scheduled.yml
name: Scheduled Tasks

on:
  schedule:
    # Daily at 2 AM UTC
    - cron: '0 2 * * *'
  workflow_dispatch:

jobs:
  # Security scanning
  security-scan:
    name: Security Scan
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run Trivy vulnerability scanner
        uses: aquasecurity/trivy-action@master
        with:
          scan-type: 'fs'
          scan-ref: '.'
          severity: 'CRITICAL,HIGH'
          format: 'sarif'
          output: 'trivy-results.sarif'

      - name: Upload Trivy scan results
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: 'trivy-results.sarif'

  # Dependency audit
  audit:
    name: Dependency Audit
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Bun
        uses: oven-sh/setup-bun@v1

      - name: Install dependencies
        run: bun install

      - name: Run audit
        run: bun audit
        continue-on-error: true

  # Docker image scan
  image-scan:
    name: Image Vulnerability Scan
    runs-on: ubuntu-latest
    strategy:
      matrix:
        app: [api, web, worker]
    steps:
      - name: Scan image
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: ghcr.io/${{ github.repository }}-${{ matrix.app }}:latest
          severity: 'CRITICAL,HIGH'
          exit-code: '0'

  # Database maintenance
  db-maintenance:
    name: Database Maintenance
    runs-on: ubuntu-latest
    environment: production
    steps:
      - name: Run VACUUM ANALYZE
        run: |
          # Connect and run maintenance
          echo "Running database maintenance..."
        env:
          DATABASE_URL: ${{ secrets.PRODUCTION_DATABASE_URL }}
```

---

## Reusable Workflows

```yaml
# .github/workflows/reusable/test.yml
name: Reusable Test Workflow

on:
  workflow_call:
    inputs:
      bun-version:
        required: false
        type: string
        default: '1.0.25'
    secrets:
      codecov-token:
        required: false

jobs:
  test:
    runs-on: ubuntu-latest
    
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: test
        ports:
          - 5432:5432
        options: --health-cmd pg_isready
      
      valkey:
        image: valkey/valkey:7-alpine
        ports:
          - 6379:6379

    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v1
        with:
          bun-version: ${{ inputs.bun-version }}

      - run: bun install --frozen-lockfile

      - run: bun run test:ci
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/test
          VALKEY_URL: redis://localhost:6379

      - uses: codecov/codecov-action@v4
        if: ${{ secrets.codecov-token != '' }}
        with:
          token: ${{ secrets.codecov-token }}
```

---

## Secrets Management

### Required Secrets

| Secret | Description | Used In |
|--------|-------------|---------|
| `GITHUB_TOKEN` | Auto-provided by GitHub | All workflows |
| `CODECOV_TOKEN` | Code coverage uploads | CI, Test |
| `STAGING_SSH_KEY` | SSH key for staging server | Staging deploy |
| `STAGING_HOST` | Staging server hostname | Staging deploy |
| `PRODUCTION_DATABASE_URL` | Production DB connection | Release |
| `DEPLOY_TOKEN` | Deployment API token | Release |
| `SLACK_WEBHOOK` | Slack notifications | Release |
| `SENTRY_AUTH_TOKEN` | Sentry release tracking | Release |

### Setting Up Secrets

```bash
# Using GitHub CLI
gh secret set STAGING_SSH_KEY < ~/.ssh/staging_key
gh secret set STAGING_HOST --body "staging.insightdesk.io"

# Environment-specific secrets
gh secret set PRODUCTION_DATABASE_URL --env production
```

### Dependabot Configuration

```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
      day: "monday"
    open-pull-requests-limit: 10
    groups:
      dev-dependencies:
        patterns:
          - "@types/*"
          - "eslint*"
          - "prettier*"
          - "typescript"
    ignore:
      - dependency-name: "*"
        update-types: ["version-update:semver-major"]

  - package-ecosystem: "docker"
    directory: "/docker"
    schedule:
      interval: "weekly"

  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
```
