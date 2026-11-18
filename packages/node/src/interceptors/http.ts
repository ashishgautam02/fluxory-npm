import http from 'http'
import https from 'https'
import {
  startSpan, endSpan, getContext, setContext, getTraceparentHeader,
  createSpanFromTraceparent, formatTraceparent,
  type Span, type SpanContext,
} from '@fluxory/core'
import { getTransport, getNodeConfig } from '../config'

let patched = false

function sanitizeHeaders(
  headers: Record<string, string | string[] | undefined>,
  redact: string[],
): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, val] of Object.entries(headers)) {
    if (val === undefined) continue
    result[key] = redact.includes(key.toLowerCase()) ? '[REDACTED]' : String(val)
  }
  return result
}

function patchClientRequest(mod: typeof http | typeof https, protocol: string): void {
  const originalRequest = mod.request

  mod.request = function patchedRequest(this: unknown, ...args: unknown[]): http.ClientRequest {
    const req = (originalRequest as Function).apply(this, args) as http.ClientRequest
    const config = getNodeConfig()
    if (!config?.enabled) return req

    const url = `${protocol}://${req.getHeader('host') ?? 'unknown'}${req.path}`
    const span = startSpan({
      operationName: `${req.method} ${req.path}`,
      kind: 'client',
      serviceType: 'external',
      attributes: {
        'http.method': req.method ?? 'GET',
        'http.url': url,
        'http.scheme': protocol,
      },
    })

    const traceparent = formatTraceparent(span.traceId, span.spanId)
    req.setHeader('traceparent', traceparent)

    req.on('response', (res) => {
      span.attributes['http.status_code'] = res.statusCode ?? 0
      endSpan(span, (res.statusCode ?? 500) < 400 ? 'ok' : 'error')
      getTransport()?.add(span)
    })

    req.on('error', (err) => {
      endSpan(span, 'error', err.message)
      getTransport()?.add(span)
    })

    return req
  } as typeof http.request
}

function patchIncomingRequest(): void {
  const originalCreateServer = http.createServer

  http.createServer = function patchedCreateServer(
    ...args: Parameters<typeof http.createServer>
  ): http.Server {
    const server = originalCreateServer.apply(this, args)
    const originalListeners = server.listeners('request').slice()

    server.removeAllListeners('request')
    server.on('request', (req: http.IncomingMessage, res: http.ServerResponse) => {
      const config = getNodeConfig()
      if (!config?.enabled) {
        for (const listener of originalListeners) {
          (listener as Function)(req, res)
        }
        return
      }

      const traceparentHeader = req.headers['traceparent'] as string | undefined
      const ctx = createSpanFromTraceparent(traceparentHeader ?? null)
      setContext(ctx)

      const span = startSpan({
        operationName: `${req.method} ${req.url}`,
        kind: 'server',
        parentContext: ctx.parentSpanId ? ctx : null,
        attributes: {
          'http.method': req.method ?? 'GET',
          'http.url': req.url ?? '/',
          'http.scheme': 'http',
        },
      })
      span.traceId = ctx.traceId
      span.spanId = ctx.spanId
      span.parentSpanId = ctx.parentSpanId

      res.setHeader('traceparent', formatTraceparent(span.traceId, span.spanId))

      const originalEnd = res.end
      res.end = function patchedEnd(this: http.ServerResponse, ...endArgs: unknown[]): http.ServerResponse {
        span.attributes['http.status_code'] = res.statusCode
        endSpan(span, res.statusCode < 400 ? 'ok' : 'error')
        getTransport()?.add(span)
        setContext(null)
        return (originalEnd as Function).apply(this, endArgs)
      } as typeof res.end

      for (const listener of originalListeners) {
        (listener as Function)(req, res)
      }
    })

    return server
  } as typeof http.createServer
}

export function patchHttp(): void {
  if (patched) return
  patched = true
  patchClientRequest(http, 'http')
  patchClientRequest(https, 'https')
  patchIncomingRequest()
}
