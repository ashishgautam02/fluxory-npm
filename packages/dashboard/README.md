# @fluxory/dashboard

Live observability dashboard for [fluxory](https://github.com/ashishgautam02/fluxory-npm).

## Install

```bash
npm install @fluxory/dashboard
```

## Usage

```bash
npx fluxory
```

Opens at `http://localhost:4000`. Receives spans from `@fluxory/node` and `@fluxory/client` over HTTP, streams updates to the UI over WebSocket.

## Features

- **Topology graph** — services, databases, caches, and queues as interactive nodes with animated edges
- **Trace list** — recent traces with status, latency, and service badges
- **Waterfall view** — drill into individual traces with per-span timing bars
- **Span detail** — attributes, events, and metadata for any selected span

## Configuration

```bash
PORT=4000 npx fluxory
```

See the [main readme](https://github.com/ashishgautam02/fluxory-npm) for full documentation.

## License

MIT
