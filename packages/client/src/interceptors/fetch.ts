import { startSpan, endSpan, formatTraceparent, getContext } from '@fluxory/core'
import { getTransport, getClientConfig } from '../config'

let patched = false

export function patchFetch(): void {
  if (patched || typeof window === 'undefined') return
  patched = true

  const originalFetch = window.fetch.bind(window)

  window.fetch = async function fluxoryFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const config = getClientConfig()
    if (!config?.enabled) return originalFetch(input, init)

    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const method = init?.method ?? (typeof input === 'object' && 'method' in input ? input.method : 'GET')

    if (isCollectorUrl(url, config.collectorUrl)) {
      return originalFetch(input, init)
    }

    const span = startSpan({
      operationName: `${method.toUpperCase()} ${extractPath(url)}`,
      kind: 'client',
      serviceType: 'external',
      parentContext: getContext(),
      attributes: {
        'http.method': method.toUpperCase(),
        'http.url': url,
        'component': 'fetch',
      },
    })

    const headers = new Headers(init?.headers)
    headers.set('traceparent', formatTraceparent(span.traceId, span.spanId))

    try {
      const response = await originalFetch(input, { ...init, headers })
      span.attributes['http.status_code'] = response.status
      endSpan(span, response.ok ? 'ok' : 'error')
      getTransport()?.add(span)
      return response
    } catch (err) {
      endSpan(span, 'error', err instanceof Error ? err.message : 'fetch failed')
      getTransport()?.add(span)
      throw err
    }
  }
}

function isCollectorUrl(url: string, collectorUrl: string): boolean {
  try {
    return new URL(url).origin === new URL(collectorUrl).origin
  } catch {
    return url.includes(collectorUrl)
  }
}

function extractPath(url: string): string {
  try {
    return new URL(url, window.location.origin).pathname
  } catch {
    return url
  }
}
