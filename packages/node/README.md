# @fluxory/node

Zero-config Node.js auto-instrumentation for [fluxory](https://github.com/AshishGautamKarn/fluxory).

## Install

```bash
npm install @fluxory/node
```

## Usage

```ts
import '@fluxory/node'
```

One import. Everything is patched automatically — HTTP, Express, databases, caches, queues.

## What's instrumented

| Category | Technologies |
|----------|-------------|
| **HTTP** | `http` / `https` outgoing requests |
| **Frameworks** | Express, Next.js |
| **Databases** | PostgreSQL, MySQL, MongoDB, Prisma, Sequelize, TypeORM |
| **Cache** | Redis |
| **Queues** | RabbitMQ, Kafka |
| **RPC** | gRPC |
| **API** | GraphQL |

## Custom tracing

```ts
import { fluxory } from '@fluxory/node'

const result = await fluxory.trace('my-operation', async (span) => {
  span.setAttribute('key', 'value')
  return await doWork()
})
```

## Configuration

```ts
import { initNode } from '@fluxory/node'

initNode({
  serviceName: 'api-gateway',
  collector: { endpoint: 'http://localhost:4000' },
})
```

See the [main readme](https://github.com/AshishGautamKarn/fluxory) for full documentation.

## License

MIT
