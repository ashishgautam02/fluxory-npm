import { generateTraceId, generateSpanId, formatTraceparent, parseTraceparent } from './id'
import type { Span, SpanKind, SpanStatus, ServiceType, FluxoryConfig, SpanEvent } from './types'

let activeConfig: FluxoryConfig | null = null

export function setConfig(config: FluxoryConfig): void {
  activeConfig = config
}

export function getConfig(): FluxoryConfig | null {
  return activeConfig
}

export interface SpanContext {
  traceId: string
  spanId: string
  parentSpanId?: string
}

let currentContext: SpanContext | null = null

export function getContext(): SpanContext | null {
  return currentContext
}

export function setContext(ctx: SpanContext | null): void {
  currentContext = ctx
}

export function createSpanFromTraceparent(header: string | null | undefined): SpanContext {
  if (header) {
    const parsed = parseTraceparent(header)
    if (parsed) {
      return {
        traceId: parsed.traceId,
        spanId: generateSpanId(),
        parentSpanId: parsed.spanId,
      }
    }
  }
  return {
    traceId: generateTraceId(),
    spanId: generateSpanId(),
  }
}

export function startSpan(opts: {
  operationName: string
  kind: SpanKind
  serviceName?: string
  serviceType?: ServiceType
  parentContext?: SpanContext | null
  attributes?: Record<string, string | number | boolean>
}): Span {
  const config = activeConfig
  const parent = opts.parentContext ?? currentContext

  const span: Span = {
    traceId: parent?.traceId ?? generateTraceId(),
    spanId: generateSpanId(),
    parentSpanId: parent?.spanId,
    operationName: opts.operationName,
    serviceName: opts.serviceName ?? config?.serviceName ?? 'unknown',
    serviceType: opts.serviceType ?? config?.serviceType ?? 'server',
    kind: opts.kind,
    startTime: Date.now(),
    status: 'unset',
    attributes: opts.attributes ?? {},
    events: [],
  }

  currentContext = { traceId: span.traceId, spanId: span.spanId, parentSpanId: span.parentSpanId }
  return span
}

export function endSpan(span: Span, status: SpanStatus = 'ok', message?: string): Span {
  span.endTime = Date.now()
  span.duration = span.endTime - span.startTime
  span.status = status
  if (message) span.statusMessage = message
  return span
}

export function addSpanEvent(span: Span, name: string, attributes?: Record<string, string | number | boolean>): void {
  const event: SpanEvent = { name, timestamp: Date.now() }
  if (attributes) event.attributes = attributes
  span.events.push(event)
}

export function getTraceparentHeader(): string | null {
  const ctx = currentContext
  if (!ctx) return null
  return formatTraceparent(ctx.traceId, ctx.spanId)
}
