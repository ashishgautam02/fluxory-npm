import { startSpan as coreStartSpan, endSpan, addSpanEvent, getContext } from './context'
import type { SpanTransport, LogTransport } from './transport'
import type { Span, SpanKind, ServiceType, LogLevel, LogEntry } from './types'

export interface TraceOptions {
  kind?: SpanKind
  serviceType?: ServiceType
  attributes?: Record<string, string | number | boolean>
}

export interface TrackerSpan {
  readonly traceId: string
  readonly spanId: string
  setAttribute(key: string, value: string | number | boolean): TrackerSpan
  addEvent(name: string, attributes?: Record<string, string | number | boolean>): TrackerSpan
  setStatus(status: 'ok' | 'error', message?: string): TrackerSpan
  end(): void
}

function wrapSpan(raw: Span, transport: SpanTransport | null): TrackerSpan {
  let ended = false
  const span: TrackerSpan = {
    get traceId() { return raw.traceId },
    get spanId() { return raw.spanId },
    setAttribute(key, value) {
      raw.attributes[key] = value
      return span
    },
    addEvent(name, attributes) {
      addSpanEvent(raw, name, attributes)
      return span
    },
    setStatus(status, message) {
      raw.status = status
      if (message) raw.statusMessage = message
      return span
    },
    end() {
      if (ended) return
      ended = true
      if (raw.status === 'unset') raw.status = 'ok'
      endSpan(raw)
      transport?.add(raw)
    },
  }
  return span
}

export interface FluxoryTracker {
  trace<T>(name: string, fn: (span: TrackerSpan) => T | Promise<T>, opts?: TraceOptions): Promise<T>
  startSpan(name: string, opts?: TraceOptions): TrackerSpan
  event(name: string, attributes?: Record<string, string | number | boolean>): void
  log(message: string, attributes?: Record<string, string | number | boolean>): void
  info(message: string, attributes?: Record<string, string | number | boolean>): void
  warn(message: string, attributes?: Record<string, string | number | boolean>): void
  error(message: string, attributes?: Record<string, string | number | boolean>): void
  debug(message: string, attributes?: Record<string, string | number | boolean>): void
}

export function createTracker(
  getTransport: () => SpanTransport | null,
  getLogTransport?: () => LogTransport | null,
  getServiceInfo?: () => { serviceName: string; serviceType: ServiceType },
): FluxoryTracker {
  function emitLog(level: LogLevel, message: string, attributes?: Record<string, string | number | boolean>): void {
    const logTransport = getLogTransport?.()
    if (!logTransport) return
    const ctx = getContext()
    const svc = getServiceInfo?.() ?? { serviceName: 'unknown', serviceType: 'server' as ServiceType }
    const entry: LogEntry = {
      timestamp: Date.now(),
      level,
      message,
      serviceName: svc.serviceName,
      serviceType: svc.serviceType,
      traceId: ctx?.traceId,
      spanId: ctx?.spanId,
      attributes,
    }
    logTransport.add(entry)
  }

  return {
    async trace<T>(name: string, fn: (span: TrackerSpan) => T | Promise<T>, opts?: TraceOptions): Promise<T> {
      const raw = coreStartSpan({
        operationName: name,
        kind: opts?.kind ?? 'internal',
        serviceType: opts?.serviceType,
        parentContext: getContext(),
        attributes: opts?.attributes,
      })
      const transport = getTransport()
      const tracker = wrapSpan(raw, transport)
      try {
        const result = await fn(tracker)
        tracker.end()
        return result
      } catch (err) {
        tracker.setStatus('error', err instanceof Error ? err.message : String(err))
        tracker.end()
        throw err
      }
    },

    startSpan(name: string, opts?: TraceOptions): TrackerSpan {
      const raw = coreStartSpan({
        operationName: name,
        kind: opts?.kind ?? 'internal',
        serviceType: opts?.serviceType,
        parentContext: getContext(),
        attributes: opts?.attributes,
      })
      return wrapSpan(raw, getTransport())
    },

    event(name: string, attributes?: Record<string, string | number | boolean>): void {
      const raw = coreStartSpan({
        operationName: `event:${name}`,
        kind: 'internal',
        parentContext: getContext(),
        attributes: attributes ?? {},
      })
      addSpanEvent(raw, name, attributes)
      endSpan(raw, 'ok')
      getTransport()?.add(raw)
    },

    log(message, attributes) { emitLog('info', message, attributes) },
    info(message, attributes) { emitLog('info', message, attributes) },
    warn(message, attributes) { emitLog('warn', message, attributes) },
    error(message, attributes) { emitLog('error', message, attributes) },
    debug(message, attributes) { emitLog('debug', message, attributes) },
  }
}
