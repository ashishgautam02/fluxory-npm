<p align="center">
  <img src="https://raw.githubusercontent.com/ashishgautam02/fluxory-npm/main/assets/logo.svg" width="48" height="48" alt="fluxory" />
</p>

<h1 align="center">fluxory</h1>

<p align="center">
  Zero-config observability for Node.js and browser applications.<br/>
  Auto-instruments your stack. Correlates traces end-to-end. Ships with a live dashboard.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@fluxory/node"><img src="https://img.shields.io/npm/v/@fluxory/node?label=%40fluxory%2Fnode&color=black" alt="npm" /></a>
  <a href="https://www.npmjs.com/package/@fluxory/client"><img src="https://img.shields.io/npm/v/@fluxory/client?label=%40fluxory%2Fclient&color=black" alt="npm" /></a>
  <a href="https://www.npmjs.com/package/@fluxory/dashboard"><img src="https://img.shields.io/npm/v/@fluxory/dashboard?label=%40fluxory%2Fdashboard&color=black" alt="npm" /></a>
  <img src="https://img.shields.io/badge/license-MIT-black" alt="MIT" />
  <a href="http://razorpay.me/@ashishgautam1058"><img src="https://img.shields.io/badge/Buy%20me%20a%20coffee-Support-black" alt="Buy me a coffee" /></a>
</p>

---

## What it does

**fluxory** auto-patches your HTTP calls, database queries, cache hits, message queues, and browser interactions — then correlates them into end-to-end traces using the W3C `traceparent` header. No manual span wiring required.

The dashboard connects over WebSocket and renders a live topology graph, trace waterfall, log viewer, and span detail view — all in real time.

## Packages

| Package | Purpose |
|---------|---------|
| `@fluxory/core` | Shared types, trace ID generation, context propagation, transport |
| `@fluxory/node` | Node.js auto-instrumentation (HTTP, Express, databases, queues) |
| `@fluxory/client` | Browser auto-instrumentation (fetch, XHR, clicks, navigation) |
| `@fluxory/dashboard` | Live dashboard with collector, topology graph, trace waterfall, and log viewer |

## Quick start

### Backend

```bash
npm install @fluxory/node @fluxory/dashboard
```

```js
// First line of your app
require('@fluxory/node')
```

Start the dashboard:

```bash
npx fluxory
```

Or auto-start it from your app — one env var, no separate process:

```bash
FLUXORY_DASHBOARD=true node app.js
```

Open `http://localhost:4000`. Traces appear as your app handles requests.

### Frontend

```bash
npm install @fluxory/client
```

```js
import { init } from '@fluxory/client'

init({
  collectorUrl: 'http://localhost:4000',
  apiKey: 'your-api-key',
})
```

Browser traces are correlated with server traces via `traceparent` propagation.

### Full stack

Backend auto-starts the dashboard. Frontend points to the same collector. One dashboard shows everything.

```bash
FLUXORY_DASHBOARD=true FLUXORY_API_KEY=my-secret-key node server.js
```

```js
// client-side
import { init } from '@fluxory/client'
init({ collectorUrl: 'http://localhost:4000', apiKey: 'my-secret-key' })
```

## Auto-instrumented technologies

### Node.js (`@fluxory/node`)

| Category | Technologies |
|----------|-------------|
| **HTTP** | `http` / `https` (outgoing requests) |
| **Frameworks** | Express, Next.js (middleware, actions, routes) |
| **Databases** | PostgreSQL (`pg`), MySQL (`mysql2`), MongoDB, Prisma, Sequelize, TypeORM |
| **Cache** | Redis (`ioredis` / `redis`) |
| **Queues** | RabbitMQ (`amqplib`), Kafka (`kafkajs`) |
| **RPC** | gRPC (`@grpc/grpc-js`) |
| **API** | GraphQL (`graphql`) |
| **Logs** | stdout / stderr capture |

### Browser (`@fluxory/client`)

| Category | Technologies |
|----------|-------------|
| **HTTP** | `fetch`, `XMLHttpRequest`, Axios |
| **Interactions** | Click tracking, route navigation |

## Custom tracing

For anything not auto-instrumented, use the tracker API:

```ts
import { fluxory } from '@fluxory/node' // or '@fluxory/client'

// Wrap async operations
const user = await fluxory.trace('load-user', async (span) => {
  span.setAttribute('userId', id)
  const result = await loadUser(id)
  span.setStatus('ok')
  return result
})

// Manual spans
const span = fluxory.startSpan('process-batch', { kind: 'internal' })
try {
  await processBatch(items)
  span.setStatus('ok')
} finally {
  span.end()
}

// Fire-and-forget events
fluxory.event('cache-miss', { key: 'users:123' })
```

## Dashboard

The dashboard is a standalone server with a built-in UI:

```bash
npx fluxory
```

**Features:**

- **Service map** — live topology graph of all services, databases, caches, and queues with animated request flow
- **Trace explorer** — filterable trace list with status, latency, and service badges
- **Waterfall view** — drill into individual traces with full span timing
- **Execution flow** — visual request path across services
- **Span detail** — attributes, events, timing, and parent-child relationships
- **Log viewer** — real-time log stream with service/level filtering and search
- **Stats bar** — traces, spans/sec, error rate, and avg latency at a glance
- **Settings** — configurable retention, max traces/logs, and sample rate
- **Real-time** — all data pushed over WebSocket, no polling

## Configuration

All configuration is through environment variables. No config files needed.

### Core

| Variable | Default | Description |
|---|---|---|
| `FLUXORY_PORT` | `4000` | Dashboard and collector port |
| `FLUXORY_API_KEY` | — | API key for ingestion (shared between sender and collector) |
| `FLUXORY_DASHBOARD` | `false` | Auto-start dashboard from `@fluxory/node` |
| `FLUXORY_DB_PATH` | — | SQLite file path for persistence (omit for in-memory only) |

### Auth

| Variable | Default | Description |
|---|---|---|
| `FLUXORY_DASH_USER` | — | Dashboard login username (both required to enable auth) |
| `FLUXORY_DASH_PASS` | — | Dashboard login password |
| `FLUXORY_SESSION_TTL` | `1440` | Session lifetime in minutes (default 24h) |

### Security

| Variable | Default | Description |
|---|---|---|
| `FLUXORY_RATE_LIMIT` | `10000` | Ingestion requests per minute per IP |
| `FLUXORY_TRUST_PROXY` | `false` | Trust `X-Forwarded-For` (enable behind a reverse proxy) |
| `FLUXORY_CORS_ORIGIN` | — | Allowed CORS origin for dashboard API (default: same-origin only) |

### Programmatic

```js
const { init } = require('@fluxory/node')

init({
  serviceName: 'api-gateway',
  collectorUrl: 'http://localhost:4000',
  apiKey: 'my-secret-key',
  dashboard: true,
  sampleRate: 0.5,
  debug: false,
})
```

## Security

The dashboard is hardened for production:

- **Timing-safe auth** — password and API key comparisons use `crypto.timingSafeEqual`
- **Brute-force protection** — login locked after 10 failed attempts per IP (15-minute window)
- **Session management** — tokens expire after 24h (configurable), with a logout endpoint
- **Body size limits** — 2MB max on all POST endpoints
- **Input validation** — payloads validated for type, structure, required fields, and batch size (max 1000 items)
- **Rate limiting** — per-IP sliding window on ingestion (10K/min) and dashboard API (600/min)
- **Security headers** — CSP, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy
- **CORS** — dashboard same-origin only by default; ingestion cross-origin allowed (API key protected); configurable via `FLUXORY_CORS_ORIGIN`
- **Proxy trust** — `X-Forwarded-For` only honored when explicitly enabled
- **Audit logging** — login attempts, API key rejections, and data clears logged with timestamps and IPs

## Persistence

Set `FLUXORY_DB_PATH` to persist spans, logs, and settings to SQLite. Data survives server restarts.

```bash
FLUXORY_DB_PATH=./fluxory.db npx fluxory
```

Uses [sql.js](https://github.com/sql-js/sql.js) (SQLite compiled to WebAssembly) — zero native dependencies, works everywhere Node.js runs.

Without it, everything is in-memory — fast, ephemeral, zero setup.

## Architecture

```
  Your app                         Dashboard (port 4000)
 ┌────────────────┐               ┌──────────────────────┐
 │  @fluxory/node │── spans ─────>│  Collector            │
 │  (auto-patch)  │── logs ──────>│    ↓                  │
 └────────────────┘               │  SpanStore            │
                                  │    ↓          ↓       │
  Browser                         │  WebSocket   SQLite   │
 ┌────────────────┐               │    ↓                  │
 │ @fluxory/client│── spans ─────>│  React SPA            │
 │  (auto-patch)  │── logs ──────>│  (live dashboard)     │
 └────────────────┘               └──────────────────────┘
```

## How it works

1. **Auto-patching** — On import, fluxory monkey-patches supported libraries to create spans automatically
2. **Context propagation** — The W3C `traceparent` header carries trace and span IDs across service boundaries
3. **Batched transport** — Spans are buffered and sent in configurable batches (non-blocking)
4. **API key auth** — Ingestion endpoints validate the `X-API-Key` header
5. **Live streaming** — The dashboard receives spans over WebSocket and updates the UI in real time
6. **Persistence** — Optional SQLite write-through keeps data across restarts
7. **Correlation** — Parent-child span relationships are reconstructed to build end-to-end trace views

## Project structure

```
fluxory/
├── packages/
│   ├── core/          Shared types, transport, trace IDs
│   ├── node/          Node.js auto-instrumentation + auto-start
│   ├── client/        Browser auto-instrumentation
│   └── dashboard/     Dashboard server + React UI + persistence
├── package.json       Workspace root
└── README.md
```

## Development

```bash
git clone https://github.com/AshishGautamKarn/fluxory.git
cd fluxory
npm install
npm run build
```

Run the dashboard in dev mode (hot reload):

```bash
npm run dev:dashboard
```

## Upcoming Features

> fluxory is just getting started. Here's what's on the roadmap.

| | Feature | Description |
|---|---------|-------------|
| :bell: | **Alerts & Notifications** | Threshold and anomaly alerts via Slack, email, and webhooks |
| :busts_in_silhouette: | **Team Auth & SSO** | Multi-user access with roles, OIDC, and SAML support |
| :bar_chart: | **Custom Dashboards** | Save filtered views, pin charts, build your own layouts |
| :brain: | **AI Insights** | Anomaly detection, automatic root cause analysis, smart error grouping |
| :stopwatch: | **Performance Budgets** | Set latency and error-rate thresholds per endpoint — fail CI builds when exceeded |
| :movie_camera: | **Session Replay** | Record browser sessions tied to traces — see what the user saw |
| :globe_with_meridians: | **Multi-Project** | Monitor multiple apps and environments from a single dashboard |
| :chart_with_upwards_trend: | **API Analytics** | Endpoint-level p50/p95/p99 latencies, throughput trends, slow query ranking |
| :satellite: | **Uptime Monitoring** | Synthetic health checks with public status pages |
| :outbox_tray: | **Export** | Trace and log export to CSV, JSON, and OpenTelemetry format |
| :cloud: | **Cloud-Hosted Collector** | Managed ingestion — no self-hosting required |
| :octocat: | **Git Integration** | Link traces to deploys and commits from GitHub and GitLab |
| :shield: | **Compliance Tools** | PII redaction rules, data masking, audit trail export |
| :world_map: | **Multi-Region** | Geo-distributed collectors with data residency controls |
| :robot: | **Slack Bot** | Query traces and get summaries directly in your channels |
| :map: | **Source Maps** | Link client-side errors back to original source code |

Want to see a feature ship sooner? [Open an issue](https://github.com/ashishgautam02/fluxory-npm/issues) or upvote an existing one.

## License

MIT

---

<p align="center">
  Built with care. If fluxory helps you, <a href="http://razorpay.me/@ashishgautam1058">buy me a coffee</a>.
</p>
