import { startSpan, endSpan, formatTraceparent, getContext, type Span } from '@fluxory/core'
import { getTransport, getClientConfig } from '../config'

let patched = false

export function patchXHR(): void {
  if (patched || typeof window === 'undefined') return
  patched = true

  const OriginalXHR = window.XMLHttpRequest
  const originalOpen = OriginalXHR.prototype.open
  const originalSend = OriginalXHR.prototype.send
  const originalSetRequestHeader = OriginalXHR.prototype.setRequestHeader

  OriginalXHR.prototype.open = function fluxoryOpen(
    this: XMLHttpRequest & { _fluxoryMethod?: string; _fluxoryUrl?: string },
    method: string,
    url: string | URL,
    ...rest: unknown[]
  ): void {
    this._fluxoryMethod = method
    this._fluxoryUrl = String(url)
    return (originalOpen as Function).call(this, method, url, ...rest)
  }

  OriginalXHR.prototype.send = function fluxorySend(
    this: XMLHttpRequest & { _fluxoryMethod?: string; _fluxoryUrl?: string; _fluxorySpan?: Span },
    body?: Document | XMLHttpRequestBodyInit | null,
  ): void {
    const config = getClientConfig()
    if (!config?.enabled || !this._fluxoryUrl) {
      return originalSend.call(this, body)
    }

    const url = this._fluxoryUrl
    if (isCollectorUrl(url, config.collectorUrl)) {
      return originalSend.call(this, body)
    }

    const method = (this._fluxoryMethod ?? 'GET').toUpperCase()
    const span = startSpan({
      operationName: `${method} ${extractPath(url)}`,
      kind: 'client',
      serviceType: 'external',
      parentContext: getContext(),
      attributes: {
        'http.method': method,
        'http.url': url,
        'component': 'xhr',
      },
    })

    this._fluxorySpan = span

    try {
      originalSetRequestHeader.call(this, 'traceparent', formatTraceparent(span.traceId, span.spanId))
    } catch {}

    this.addEventListener('loadend', function onLoadEnd() {
      if (span) {
        span.attributes['http.status_code'] = this.status
        endSpan(span, this.status > 0 && this.status < 400 ? 'ok' : 'error')
        getTransport()?.add(span)
      }
    })

    this.addEventListener('error', function onError() {
      if (span) {
        endSpan(span, 'error', 'XHR network error')
        getTransport()?.add(span)
      }
    })

    this.addEventListener('timeout', function onTimeout() {
      if (span) {
        endSpan(span, 'error', 'XHR timeout')
        getTransport()?.add(span)
      }
    })

    return originalSend.call(this, body)
  }
}

function isCollectorUrl(url: string, collectorUrl: string): boolean {
  try {
    return new URL(url, window.location.origin).origin === new URL(collectorUrl).origin
  } catch {
    return false
  }
}

function extractPath(url: string): string {
  try {
    return new URL(url, window.location.origin).pathname
  } catch {
    return url
  }
}
