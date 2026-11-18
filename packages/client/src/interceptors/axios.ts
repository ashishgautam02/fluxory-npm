import { startSpan, endSpan, formatTraceparent, getContext } from '@fluxory/core'
import { getTransport, getClientConfig } from '../config'

let patched = false

export function patchAxios(): void {
  if (patched) return
  patched = true

  try {
    const axios = require('axios')
    if (!axios?.interceptors) return

    axios.interceptors.request.use((config: {
      method?: string
      url?: string
      baseURL?: string
      headers?: Record<string, string>
      _fluxorySpan?: unknown
    }) => {
      const fluxoryConfig = getClientConfig()
      if (!fluxoryConfig?.enabled) return config

      const url = config.url ?? '/'
      const fullUrl = config.baseURL ? `${config.baseURL}${url}` : url

      if (isCollectorUrl(fullUrl, fluxoryConfig.collectorUrl)) return config

      const method = (config.method ?? 'GET').toUpperCase()
      const span = startSpan({
        operationName: `${method} ${extractPath(fullUrl)}`,
        kind: 'client',
        serviceType: 'external',
        parentContext: getContext(),
        attributes: {
          'http.method': method,
          'http.url': fullUrl,
          'component': 'axios',
          ...(config.baseURL ? { 'http.base_url': config.baseURL } : {}),
        },
      })

      if (!config.headers) config.headers = {}
      config.headers['traceparent'] = formatTraceparent(span.traceId, span.spanId)
      config._fluxorySpan = span

      return config
    })

    axios.interceptors.response.use(
      (response: { config?: { _fluxorySpan?: ReturnType<typeof startSpan> }; status?: number }) => {
        const span = response.config?._fluxorySpan
        if (span) {
          span.attributes['http.status_code'] = response.status ?? 0
          endSpan(span, (response.status ?? 200) < 400 ? 'ok' : 'error')
          getTransport()?.add(span)
        }
        return response
      },
      (error: { config?: { _fluxorySpan?: ReturnType<typeof startSpan> }; response?: { status?: number }; message?: string }) => {
        const span = error.config?._fluxorySpan
        if (span) {
          if (error.response?.status) span.attributes['http.status_code'] = error.response.status
          endSpan(span, 'error', error.message ?? 'Axios request failed')
          getTransport()?.add(span)
        }
        throw error
      },
    )

    if (axios.create) {
      const originalCreate = axios.create
      axios.create = function patchedCreate(...args: unknown[]) {
        const instance = originalCreate.apply(this, args)
        patchAxiosInstance(instance)
        return instance
      }
    }
  } catch {}
}

function patchAxiosInstance(instance: {
  interceptors?: {
    request?: { use: Function }
    response?: { use: Function }
  }
}): void {
  if (!instance?.interceptors) return

  instance.interceptors.request.use((config: {
    method?: string; url?: string; baseURL?: string
    headers?: Record<string, string>; _fluxorySpan?: unknown
  }) => {
    const fluxoryConfig = getClientConfig()
    if (!fluxoryConfig?.enabled) return config

    const url = config.url ?? '/'
    const fullUrl = config.baseURL ? `${config.baseURL}${url}` : url
    if (isCollectorUrl(fullUrl, fluxoryConfig.collectorUrl)) return config

    const method = (config.method ?? 'GET').toUpperCase()
    const span = startSpan({
      operationName: `${method} ${extractPath(fullUrl)}`,
      kind: 'client',
      serviceType: 'external',
      parentContext: getContext(),
      attributes: {
        'http.method': method,
        'http.url': fullUrl,
        'component': 'axios',
      },
    })

    if (!config.headers) config.headers = {}
    config.headers['traceparent'] = formatTraceparent(span.traceId, span.spanId)
    config._fluxorySpan = span
    return config
  })

  instance.interceptors.response.use(
    (response: { config?: { _fluxorySpan?: ReturnType<typeof startSpan> }; status?: number }) => {
      const span = response.config?._fluxorySpan
      if (span) {
        span.attributes['http.status_code'] = response.status ?? 0
        endSpan(span, (response.status ?? 200) < 400 ? 'ok' : 'error')
        getTransport()?.add(span)
      }
      return response
    },
    (error: { config?: { _fluxorySpan?: ReturnType<typeof startSpan> }; response?: { status?: number }; message?: string }) => {
      const span = error.config?._fluxorySpan
      if (span) {
        endSpan(span, 'error', error.message)
        getTransport()?.add(span)
      }
      throw error
    },
  )
}

function isCollectorUrl(url: string, collectorUrl: string): boolean {
  try {
    const urlOrigin = typeof window !== 'undefined' ? new URL(url, window.location.origin).origin : new URL(url).origin
    return urlOrigin === new URL(collectorUrl).origin
  } catch {
    return false
  }
}

function extractPath(url: string): string {
  try {
    const base = typeof window !== 'undefined' ? window.location.origin : undefined
    return new URL(url, base).pathname
  } catch {
    return url
  }
}
