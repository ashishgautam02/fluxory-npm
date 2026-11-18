import {
  startSpan, endSpan, getContext, setContext,
  createSpanFromTraceparent, formatTraceparent,
} from '@fluxory/core'
import { getTransport, getNodeConfig } from '../config'

export function withFluxoryMiddleware(middleware: Function) {
  return async function fluxoryMiddleware(request: { headers: { get?: Function }; method?: string; url?: string; nextUrl?: { pathname?: string } }, ...rest: unknown[]) {
    const config = getNodeConfig()
    if (!config?.enabled) return middleware(request, ...rest)

    const traceparent = request.headers.get?.('traceparent') ?? null
    const ctx = createSpanFromTraceparent(traceparent)
    setContext(ctx)

    const pathname = request.nextUrl?.pathname ?? new URL(request.url ?? '/', 'http://localhost').pathname

    const span = startSpan({
      operationName: `middleware:${pathname}`,
      kind: 'server',
      serviceType: 'server',
      parentContext: ctx.parentSpanId ? ctx : null,
      attributes: {
        'http.method': request.method ?? 'GET',
        'http.route': pathname,
        'next.runtime': 'edge',
        'component': 'next-middleware',
      },
    })

    try {
      const response = await middleware(request, ...rest)

      if (response?.status) {
        span.attributes['http.status_code'] = response.status
      }
      if (response?.headers?.set) {
        response.headers.set('traceparent', formatTraceparent(span.traceId, span.spanId))
      }

      endSpan(span, (response?.status ?? 200) < 400 ? 'ok' : 'error')
      getTransport()?.add(span)
      return response
    } catch (err) {
      endSpan(span, 'error', err instanceof Error ? err.message : String(err))
      getTransport()?.add(span)
      throw err
    }
  }
}

export function withFluxoryAction<T extends (...args: unknown[]) => Promise<unknown>>(
  name: string,
  action: T,
): T {
  return (async (...args: unknown[]) => {
    const config = getNodeConfig()
    if (!config?.enabled) return action(...args)

    const span = startSpan({
      operationName: `action:${name}`,
      kind: 'server',
      serviceType: 'server',
      parentContext: getContext(),
      attributes: {
        'next.action': name,
        'component': 'next-server-action',
      },
    })

    try {
      const result = await action(...args)
      endSpan(span, 'ok')
      getTransport()?.add(span)
      return result
    } catch (err) {
      endSpan(span, 'error', err instanceof Error ? err.message : String(err))
      getTransport()?.add(span)
      throw err
    }
  }) as T
}

export function withFluxoryRoute(handler: Function) {
  return async function fluxoryRoute(request: { headers: { get?: Function }; method?: string; url?: string }, context?: unknown) {
    const config = getNodeConfig()
    if (!config?.enabled) return handler(request, context)

    const traceparent = request.headers.get?.('traceparent') ?? null
    const ctx = createSpanFromTraceparent(traceparent)
    setContext(ctx)

    const url = request.url ? new URL(request.url).pathname : '/api/unknown'

    const span = startSpan({
      operationName: `${request.method ?? 'GET'} ${url}`,
      kind: 'server',
      serviceType: 'server',
      parentContext: ctx.parentSpanId ? ctx : null,
      attributes: {
        'http.method': request.method ?? 'GET',
        'http.route': url,
        'component': 'next-route-handler',
      },
    })

    try {
      const response = await handler(request, context)

      if (response?.status) {
        span.attributes['http.status_code'] = response.status
      }

      endSpan(span, (response?.status ?? 200) < 400 ? 'ok' : 'error')
      getTransport()?.add(span)
      return response
    } catch (err) {
      endSpan(span, 'error', err instanceof Error ? err.message : String(err))
      getTransport()?.add(span)
      throw err
    }
  }
}
