# Load Testing

> Performance validation and capacity planning for InsightDesk.

## Table of Contents

1. [Testing Strategy](#testing-strategy)
2. [k6 Setup](#k6-setup)
3. [Test Scenarios](#test-scenarios)
4. [API Load Tests](#api-load-tests)
5. [WebSocket Tests](#websocket-tests)
6. [Database Load Tests](#database-load-tests)
7. [Results Analysis](#results-analysis)
8. [CI Integration](#ci-integration)

---

## Testing Strategy

### Performance Goals

| Metric | Target | Critical |
|--------|--------|----------|
| API P50 Latency | < 50ms | < 100ms |
| API P95 Latency | < 200ms | < 500ms |
| API P99 Latency | < 500ms | < 1s |
| Error Rate | < 0.1% | < 1% |
| Throughput | > 1000 RPS | > 500 RPS |
| WebSocket Connections | > 10,000 | > 5,000 |

### Test Types

```
┌─────────────────────────────────────────────────────────────────┐
│                       Load Testing Pyramid                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│                      ┌─────────────────┐                         │
│                      │   Chaos Tests   │                         │
│                      │  (Quarterly)    │                         │
│                      └────────┬────────┘                         │
│                               │                                  │
│                 ┌─────────────┴─────────────┐                    │
│                 │      Stress Tests         │                    │
│                 │      (Pre-release)        │                    │
│                 └─────────────┬─────────────┘                    │
│                               │                                  │
│           ┌───────────────────┴───────────────────┐              │
│           │           Soak Tests                  │              │
│           │           (Weekly)                    │              │
│           └───────────────────┬───────────────────┘              │
│                               │                                  │
│     ┌─────────────────────────┴─────────────────────────┐        │
│     │              Smoke/Load Tests                      │        │
│     │              (Every Deploy)                        │        │
│     └────────────────────────────────────────────────────┘        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## k6 Setup

### Installation

```powershell
# Windows (with Chocolatey)
choco install k6

# Or download from GitHub releases
# https://github.com/grafana/k6/releases
```

### Project Structure

```
load-tests/
├── lib/
│   ├── config.js           # Shared configuration
│   ├── helpers.js          # Utility functions
│   ├── auth.js             # Authentication helpers
│   └── checks.js           # Common assertions
├── scenarios/
│   ├── smoke.js            # Quick validation
│   ├── load.js             # Standard load test
│   ├── stress.js           # Breaking point test
│   ├── soak.js             # Endurance test
│   └── spike.js            # Sudden traffic spike
├── tests/
│   ├── api/
│   │   ├── tickets.js      # Ticket API tests
│   │   ├── auth.js         # Auth flow tests
│   │   └── knowledge-base.js
│   └── websocket/
│       └── realtime.js     # WebSocket tests
├── data/
│   └── users.json          # Test user data
└── package.json
```

### Configuration

```javascript
// load-tests/lib/config.js
export const config = {
  baseUrl: __ENV.BASE_URL || 'http://localhost:3001',
  wsUrl: __ENV.WS_URL || 'ws://localhost:3001',
  
  thresholds: {
    http_req_duration: ['p(95)<200', 'p(99)<500'],
    http_req_failed: ['rate<0.01'],
    http_reqs: ['rate>100'],
  },
  
  stages: {
    smoke: [
      { duration: '1m', target: 5 },
      { duration: '1m', target: 0 },
    ],
    load: [
      { duration: '2m', target: 50 },
      { duration: '5m', target: 50 },
      { duration: '2m', target: 100 },
      { duration: '5m', target: 100 },
      { duration: '2m', target: 0 },
    ],
    stress: [
      { duration: '2m', target: 100 },
      { duration: '5m', target: 200 },
      { duration: '5m', target: 300 },
      { duration: '5m', target: 400 },
      { duration: '10m', target: 500 },
      { duration: '5m', target: 0 },
    ],
    soak: [
      { duration: '5m', target: 100 },
      { duration: '4h', target: 100 },
      { duration: '5m', target: 0 },
    ],
    spike: [
      { duration: '1m', target: 50 },
      { duration: '30s', target: 500 },
      { duration: '1m', target: 500 },
      { duration: '30s', target: 50 },
      { duration: '2m', target: 50 },
      { duration: '1m', target: 0 },
    ],
  },
};
```

### Helper Functions

```javascript
// load-tests/lib/helpers.js
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
export const errorRate = new Rate('errors');
export const ticketCreationDuration = new Trend('ticket_creation_duration');

export function randomItem(array) {
  return array[Math.floor(Math.random() * array.length)];
}

export function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function generateTicket() {
  return {
    title: `Test Ticket ${Date.now()}`,
    description: `Load test ticket created at ${new Date().toISOString()}`,
    priority: randomItem(['LOW', 'MEDIUM', 'HIGH', 'URGENT']),
  };
}

export function checkResponse(response, name) {
  const success = check(response, {
    [`${name} status is 2xx`]: (r) => r.status >= 200 && r.status < 300,
    [`${name} has body`]: (r) => r.body && r.body.length > 0,
    [`${name} response time < 500ms`]: (r) => r.timings.duration < 500,
  });
  
  errorRate.add(!success);
  return success;
}
```

### Authentication

```javascript
// load-tests/lib/auth.js
import http from 'k6/http';
import { config } from './config.js';

const tokens = {};

export function login(email, password) {
  const cacheKey = email;
  
  if (tokens[cacheKey] && tokens[cacheKey].expiresAt > Date.now()) {
    return tokens[cacheKey].accessToken;
  }
  
  const response = http.post(
    `${config.baseUrl}/api/v1/auth/login`,
    JSON.stringify({ email, password }),
    {
      headers: { 'Content-Type': 'application/json' },
    }
  );
  
  if (response.status === 200) {
    const body = JSON.parse(response.body);
    tokens[cacheKey] = {
      accessToken: body.accessToken,
      expiresAt: Date.now() + 3600 * 1000, // 1 hour
    };
    return body.accessToken;
  }
  
  throw new Error(`Login failed: ${response.status}`);
}

export function authHeaders(token) {
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}
```

---

## Test Scenarios

### Smoke Test

```javascript
// load-tests/scenarios/smoke.js
import http from 'k6/http';
import { check, sleep } from 'k6';
import { config } from '../lib/config.js';

export const options = {
  vus: 3,
  duration: '1m',
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<500'],
  },
};

export default function () {
  // Health check
  const healthRes = http.get(`${config.baseUrl}/health`);
  check(healthRes, {
    'health check passed': (r) => r.status === 200,
  });
  
  // API endpoints accessible
  const apiRes = http.get(`${config.baseUrl}/api/v1/health`);
  check(apiRes, {
    'API accessible': (r) => r.status === 200,
  });
  
  sleep(1);
}
```

### Load Test

```javascript
// load-tests/scenarios/load.js
import { config } from '../lib/config.js';
import { login, authHeaders } from '../lib/auth.js';
import { createTicketScenario } from '../tests/api/tickets.js';
import { browseKnowledgeBase } from '../tests/api/knowledge-base.js';

export const options = {
  scenarios: {
    ticket_operations: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: config.stages.load,
      gracefulRampDown: '30s',
      exec: 'ticketOperations',
    },
    knowledge_base_browsing: {
      executor: 'constant-arrival-rate',
      rate: 50,
      timeUnit: '1s',
      duration: '15m',
      preAllocatedVUs: 20,
      maxVUs: 100,
      exec: 'knowledgeBase',
    },
  },
  thresholds: config.thresholds,
};

export function ticketOperations() {
  const token = login('agent@test.com', 'password');
  createTicketScenario(token);
}

export function knowledgeBase() {
  browseKnowledgeBase();
}
```

### Stress Test

```javascript
// load-tests/scenarios/stress.js
import http from 'k6/http';
import { check, sleep } from 'k6';
import { config } from '../lib/config.js';
import { login, authHeaders } from '../lib/auth.js';

export const options = {
  stages: config.stages.stress,
  thresholds: {
    http_req_failed: ['rate<0.05'], // Allow higher error rate
    http_req_duration: ['p(95)<1000'],
  },
};

export default function () {
  const token = login('agent@test.com', 'password');
  const headers = authHeaders(token);
  
  // Mix of operations
  const operations = [
    () => listTickets(headers),
    () => createTicket(headers),
    () => getTicketDetails(headers),
    () => searchTickets(headers),
    () => getDashboard(headers),
  ];
  
  const operation = operations[Math.floor(Math.random() * operations.length)];
  operation();
  
  sleep(0.5);
}

function listTickets(headers) {
  const res = http.get(`${config.baseUrl}/api/v1/tickets?limit=20`, { headers });
  check(res, { 'list tickets': (r) => r.status === 200 });
}

function createTicket(headers) {
  const res = http.post(
    `${config.baseUrl}/api/v1/tickets`,
    JSON.stringify({
      title: `Stress Test ${Date.now()}`,
      description: 'Stress test ticket',
      priority: 'MEDIUM',
    }),
    { headers }
  );
  check(res, { 'create ticket': (r) => r.status === 201 });
}

function getTicketDetails(headers) {
  // First get a ticket ID
  const listRes = http.get(`${config.baseUrl}/api/v1/tickets?limit=1`, { headers });
  if (listRes.status === 200) {
    const tickets = JSON.parse(listRes.body).data;
    if (tickets.length > 0) {
      const res = http.get(`${config.baseUrl}/api/v1/tickets/${tickets[0].id}`, { headers });
      check(res, { 'get ticket details': (r) => r.status === 200 });
    }
  }
}

function searchTickets(headers) {
  const res = http.get(`${config.baseUrl}/api/v1/tickets/search?q=test`, { headers });
  check(res, { 'search tickets': (r) => r.status === 200 });
}

function getDashboard(headers) {
  const res = http.get(`${config.baseUrl}/api/v1/analytics/dashboard`, { headers });
  check(res, { 'get dashboard': (r) => r.status === 200 });
}
```

---

## API Load Tests

### Ticket API Tests

```javascript
// load-tests/tests/api/tickets.js
import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Trend, Counter } from 'k6/metrics';
import { config } from '../../lib/config.js';
import { authHeaders, generateTicket, checkResponse } from '../../lib/helpers.js';

const ticketCreated = new Counter('tickets_created');
const ticketCreateDuration = new Trend('ticket_create_duration');

export function createTicketScenario(token) {
  const headers = authHeaders(token);
  
  group('Ticket CRUD Operations', () => {
    // Create ticket
    let ticketId;
    group('Create Ticket', () => {
      const ticket = generateTicket();
      const startTime = Date.now();
      
      const res = http.post(
        `${config.baseUrl}/api/v1/tickets`,
        JSON.stringify(ticket),
        { headers }
      );
      
      ticketCreateDuration.add(Date.now() - startTime);
      
      if (checkResponse(res, 'Create Ticket')) {
        ticketCreated.add(1);
        ticketId = JSON.parse(res.body).id;
      }
    });
    
    sleep(0.5);
    
    // Get ticket
    if (ticketId) {
      group('Get Ticket', () => {
        const res = http.get(
          `${config.baseUrl}/api/v1/tickets/${ticketId}`,
          { headers }
        );
        checkResponse(res, 'Get Ticket');
      });
      
      sleep(0.3);
      
      // Update ticket
      group('Update Ticket', () => {
        const res = http.patch(
          `${config.baseUrl}/api/v1/tickets/${ticketId}`,
          JSON.stringify({ status: 'IN_PROGRESS' }),
          { headers }
        );
        checkResponse(res, 'Update Ticket');
      });
      
      sleep(0.3);
      
      // Add comment
      group('Add Comment', () => {
        const res = http.post(
          `${config.baseUrl}/api/v1/tickets/${ticketId}/comments`,
          JSON.stringify({ content: 'Load test comment' }),
          { headers }
        );
        checkResponse(res, 'Add Comment');
      });
    }
    
    // List tickets
    group('List Tickets', () => {
      const res = http.get(
        `${config.baseUrl}/api/v1/tickets?page=1&limit=20`,
        { headers }
      );
      checkResponse(res, 'List Tickets');
    });
  });
  
  sleep(1);
}

export function ticketSearchScenario(token) {
  const headers = authHeaders(token);
  
  group('Ticket Search', () => {
    const queries = ['urgent', 'billing', 'support', 'technical'];
    const query = queries[Math.floor(Math.random() * queries.length)];
    
    const res = http.get(
      `${config.baseUrl}/api/v1/tickets/search?q=${query}`,
      { headers }
    );
    checkResponse(res, 'Search Tickets');
  });
  
  sleep(0.5);
}
```

### Authentication Tests

```javascript
// load-tests/tests/api/auth.js
import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Trend } from 'k6/metrics';
import { config } from '../../lib/config.js';

const loginDuration = new Trend('login_duration');

export function authFlowScenario() {
  group('Authentication Flow', () => {
    let accessToken;
    let refreshToken;
    
    // Login
    group('Login', () => {
      const startTime = Date.now();
      const res = http.post(
        `${config.baseUrl}/api/v1/auth/login`,
        JSON.stringify({
          email: 'loadtest@example.com',
          password: 'loadtest123',
        }),
        { headers: { 'Content-Type': 'application/json' } }
      );
      
      loginDuration.add(Date.now() - startTime);
      
      check(res, {
        'login successful': (r) => r.status === 200,
        'has access token': (r) => {
          const body = JSON.parse(r.body);
          accessToken = body.accessToken;
          refreshToken = body.refreshToken;
          return !!accessToken;
        },
      });
    });
    
    sleep(0.5);
    
    // Access protected resource
    if (accessToken) {
      group('Access Protected Resource', () => {
        const res = http.get(
          `${config.baseUrl}/api/v1/user/me`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        check(res, {
          'protected resource accessible': (r) => r.status === 200,
        });
      });
      
      sleep(0.5);
      
      // Refresh token
      group('Refresh Token', () => {
        const res = http.post(
          `${config.baseUrl}/api/v1/auth/refresh`,
          JSON.stringify({ refreshToken }),
          { headers: { 'Content-Type': 'application/json' } }
        );
        check(res, {
          'refresh successful': (r) => r.status === 200,
        });
      });
    }
  });
  
  sleep(1);
}
```

---

## WebSocket Tests

### Real-time Connection Test

```javascript
// load-tests/tests/websocket/realtime.js
import ws from 'k6/ws';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';
import { config } from '../../lib/config.js';
import { login } from '../../lib/auth.js';

const wsConnections = new Counter('ws_connections');
const wsMessages = new Counter('ws_messages_received');
const wsLatency = new Trend('ws_message_latency');

export const options = {
  scenarios: {
    websocket: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 100 },
        { duration: '5m', target: 500 },
        { duration: '5m', target: 1000 },
        { duration: '2m', target: 0 },
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    ws_connections: ['count>500'],
    ws_message_latency: ['p(95)<100'],
  },
};

export default function () {
  const token = login('agent@test.com', 'password');
  
  const url = `${config.wsUrl}/socket.io/?EIO=4&transport=websocket&token=${token}`;
  
  const res = ws.connect(url, {}, function (socket) {
    wsConnections.add(1);
    
    socket.on('open', () => {
      console.log('WebSocket connected');
      
      // Subscribe to ticket channel
      socket.send(JSON.stringify({
        type: 'subscribe',
        channel: 'tickets:org_123',
      }));
    });
    
    socket.on('message', (msg) => {
      wsMessages.add(1);
      
      try {
        const data = JSON.parse(msg);
        if (data.timestamp) {
          const latency = Date.now() - data.timestamp;
          wsLatency.add(latency);
        }
      } catch (e) {
        // Not JSON, possibly ping/pong
      }
    });
    
    socket.on('error', (e) => {
      console.error('WebSocket error:', e);
    });
    
    // Keep connection open
    socket.setInterval(() => {
      socket.ping();
    }, 25000);
    
    // Simulate user activity
    socket.setTimeout(() => {
      socket.send(JSON.stringify({
        type: 'typing',
        ticketId: 'ticket_123',
      }));
    }, 5000);
    
    // Keep connection for test duration
    socket.setTimeout(() => {
      socket.close();
    }, 60000);
  });
  
  check(res, { 'WebSocket connected': (r) => r && r.status === 101 });
}
```

---

## Database Load Tests

### Direct Database Performance

```javascript
// load-tests/tests/database/queries.js
import sql from 'k6/x/sql';
import { check } from 'k6';
import { Trend, Counter } from 'k6/metrics';

const db = sql.open('postgres', __ENV.DATABASE_URL);

const queryDuration = new Trend('db_query_duration');
const queriesExecuted = new Counter('db_queries_executed');

export const options = {
  vus: 20,
  duration: '5m',
  thresholds: {
    db_query_duration: ['p(95)<100'],
  },
};

export function setup() {
  // Ensure test data exists
  db.exec(`
    INSERT INTO tickets (id, title, status, organization_id, created_at)
    SELECT 
      'loadtest_' || i,
      'Load Test Ticket ' || i,
      'OPEN',
      'org_loadtest',
      NOW() - (random() * interval '30 days')
    FROM generate_series(1, 1000) i
    ON CONFLICT DO NOTHING
  `);
}

export default function () {
  // Query 1: List tickets with pagination
  measureQuery('list_tickets', () => {
    return db.query(`
      SELECT t.*, u.name as assignee_name
      FROM tickets t
      LEFT JOIN users u ON t.assignee_id = u.id
      WHERE t.organization_id = 'org_loadtest'
      ORDER BY t.created_at DESC
      LIMIT 20 OFFSET $1
    `, Math.floor(Math.random() * 50) * 20);
  });
  
  // Query 2: Search tickets
  measureQuery('search_tickets', () => {
    return db.query(`
      SELECT * FROM tickets
      WHERE organization_id = 'org_loadtest'
        AND to_tsvector('english', title) @@ plainto_tsquery('english', $1)
      LIMIT 20
    `, 'test');
  });
  
  // Query 3: Aggregate statistics
  measureQuery('ticket_stats', () => {
    return db.query(`
      SELECT 
        status,
        COUNT(*) as count,
        AVG(EXTRACT(EPOCH FROM (NOW() - created_at))) as avg_age_seconds
      FROM tickets
      WHERE organization_id = 'org_loadtest'
      GROUP BY status
    `);
  });
}

function measureQuery(name, queryFn) {
  const start = Date.now();
  const result = queryFn();
  const duration = Date.now() - start;
  
  queryDuration.add(duration, { query: name });
  queriesExecuted.add(1, { query: name });
  
  check(result, {
    [`${name} executed`]: (r) => r !== null,
  });
}

export function teardown() {
  // Cleanup test data
  db.exec(`DELETE FROM tickets WHERE organization_id = 'org_loadtest'`);
  db.close();
}
```

---

## Results Analysis

### Output Formats

```powershell
# Run with JSON output
k6 run --out json=results.json scenarios/load.js

# Run with InfluxDB output
k6 run --out influxdb=http://localhost:8086/k6 scenarios/load.js

# Run with Prometheus output
k6 run --out experimental-prometheus-rw=http://localhost:9090/api/v1/write scenarios/load.js

# HTML report
k6 run --out json=results.json scenarios/load.js
# Then use k6-reporter to generate HTML
```

### Grafana Dashboard

```json
{
  "dashboard": {
    "title": "k6 Load Test Results",
    "panels": [
      {
        "title": "Request Rate",
        "type": "graph",
        "targets": [
          {
            "expr": "rate(k6_http_reqs_total[1m])",
            "legendFormat": "Requests/sec"
          }
        ]
      },
      {
        "title": "Response Time Percentiles",
        "type": "graph",
        "targets": [
          {
            "expr": "histogram_quantile(0.50, rate(k6_http_req_duration_bucket[1m]))",
            "legendFormat": "p50"
          },
          {
            "expr": "histogram_quantile(0.95, rate(k6_http_req_duration_bucket[1m]))",
            "legendFormat": "p95"
          },
          {
            "expr": "histogram_quantile(0.99, rate(k6_http_req_duration_bucket[1m]))",
            "legendFormat": "p99"
          }
        ]
      },
      {
        "title": "Error Rate",
        "type": "graph",
        "targets": [
          {
            "expr": "rate(k6_http_req_failed_total[1m]) / rate(k6_http_reqs_total[1m]) * 100",
            "legendFormat": "Error %"
          }
        ]
      },
      {
        "title": "Virtual Users",
        "type": "graph",
        "targets": [
          {
            "expr": "k6_vus",
            "legendFormat": "VUs"
          }
        ]
      }
    ]
  }
}
```

---

## CI Integration

### GitHub Actions Workflow

```yaml
# .github/workflows/load-test.yml
name: Load Tests

on:
  schedule:
    - cron: '0 2 * * 1'  # Weekly on Monday at 2 AM
  workflow_dispatch:
    inputs:
      scenario:
        description: 'Test scenario to run'
        required: true
        default: 'smoke'
        type: choice
        options:
          - smoke
          - load
          - stress

jobs:
  load-test:
    runs-on: ubuntu-latest
    
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: insightdesk_test
        ports:
          - 5432:5432
      
      valkey:
        image: valkey/valkey:7
        ports:
          - 6379:6379
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup k6
        uses: grafana/setup-k6-action@v1
      
      - name: Setup Bun
        uses: oven-sh/setup-bun@v1
      
      - name: Install dependencies
        run: bun install
      
      - name: Start API server
        run: |
          cd backend
          bun run start &
          sleep 10
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/insightdesk_test
          VALKEY_URL: redis://localhost:6379
      
      - name: Run load tests
        run: |
          k6 run \
            --out json=results.json \
            load-tests/scenarios/${{ github.event.inputs.scenario || 'smoke' }}.js
        env:
          BASE_URL: http://localhost:3001
          WS_URL: ws://localhost:3001
      
      - name: Upload results
        uses: actions/upload-artifact@v4
        with:
          name: k6-results
          path: results.json
      
      - name: Check thresholds
        run: |
          if grep -q '"thresholdsFailed":true' results.json; then
            echo "Performance thresholds failed!"
            exit 1
          fi
```

### Pre-deployment Gate

```yaml
# Part of deployment workflow
load-test-gate:
  runs-on: ubuntu-latest
  needs: [build, integration-tests]
  
  steps:
    - uses: actions/checkout@v4
    
    - name: Deploy to staging
      run: ./scripts/deploy-staging.sh
    
    - name: Wait for deployment
      run: sleep 60
    
    - name: Run smoke tests
      uses: grafana/k6-action@v0.3.1
      with:
        filename: load-tests/scenarios/smoke.js
      env:
        BASE_URL: ${{ secrets.STAGING_URL }}
    
    - name: Verify results
      run: |
        if [ "${{ steps.k6.outcome }}" != "success" ]; then
          echo "Smoke tests failed, blocking deployment"
          exit 1
        fi
```
