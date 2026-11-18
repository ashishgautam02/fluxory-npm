import {
  startSpan, endSpan, setContext, createSpanFromTraceparent,
  formatTraceparent, type Span,
} from '@fluxory/core'
import { getTransport, getNodeConfig } from '../config'

type Request = { method: string; url: string; originalUrl?: string; path?: string; headers: Record<string, string | string[] | undefined>; _fluxorySpan?: Span }
type Response = { statusCode: number; end: Function; setHeader: Function }
type NextFn = (err?: unknown) => void

export function expressMiddleware() {
  return function fluxoryMiddleware(req: Request, res: Response, next: NextFn): void {
    const config = getNodeConfig()
    if (!config?.enabled) { next(); return }

    const traceparentHeader = req.headers['traceparent'] as string | undefined
    const ctx = createSpanFromTraceparent(traceparentHeader ?? null)
    setContext(ctx)

    const route = req.originalUrl ?? req.url ?? '/'
    const span = startSpan({
      operationName: `${req.method} ${route}`,
      kind: 'server',
      parentContext: ctx.parentSpanId ? ctx : null,
      attributes: {
        'http.method': req.method,
        'http.route': route,
        'http.url': req.originalUrl ?? req.url ?? '/',
      },
    })
    span.traceId = ctx.traceId
    span.spanId = ctx.spanId
    span.parentSpanId = ctx.parentSpanId

    req._fluxorySpan = span
    res.setHeader('traceparent', formatTraceparent(span.traceId, span.spanId))

    const originalEnd = res.end
    res.end = function patchedEnd(this: Response, ...args: unknown[]): unknown {
      span.attributes['http.status_code'] = res.statusCode
      if (req.path) span.attributes['http.route'] = req.path
      endSpan(span, res.statusCode < 400 ? 'ok' : 'error')
      getTransport()?.add(span)
      setContext(null)
      return originalEnd.apply(this, args)
    }

    next()
  }
}
