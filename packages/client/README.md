# @fluxory/client

Zero-config browser auto-instrumentation for [fluxory](https://github.com/ashishgautam02/fluxory-npm).

## Install

```bash
npm install @fluxory/client
```

## Usage

```ts
import '@fluxory/client'
```

Automatically patches `fetch`, `XMLHttpRequest`, Axios, click tracking, and route navigation. Traces are correlated with your server via W3C `traceparent` headers.

## Custom tracing

```ts
import { fluxory } from '@fluxory/client'

const result = await fluxory.trace('checkout', async (span) => {
  span.setAttribute('cartSize', items.length)
  return await submitOrder(items)
})
```

## Configuration

```ts
import { initClient } from '@fluxory/client'

initClient({
  serviceName: 'web-app',
  collector: { endpoint: 'http://localhost:4000' },
})
```

See the [main readme](https://github.com/ashishgautam02/fluxory-npm) for full documentation.

## License

MIT
