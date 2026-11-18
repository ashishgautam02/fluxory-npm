import { startSpan, endSpan, setContext } from '@fluxory/core'
import { getTransport, getClientConfig } from '../config'

let patched = false

export function patchNavigation(): void {
  if (patched || typeof window === 'undefined') return
  patched = true

  const originalPushState = history.pushState.bind(history)
  const originalReplaceState = history.replaceState.bind(history)

  history.pushState = function fluxoryPushState(...args: Parameters<typeof history.pushState>): void {
    trackNavigation('pushState', args[2]?.toString() ?? '')
    return originalPushState(...args)
  }

  history.replaceState = function fluxoryReplaceState(...args: Parameters<typeof history.replaceState>): void {
    trackNavigation('replaceState', args[2]?.toString() ?? '')
    return originalReplaceState(...args)
  }

  window.addEventListener('popstate', () => {
    trackNavigation('popstate', window.location.pathname)
  })
}

function trackNavigation(trigger: string, url: string): void {
  const config = getClientConfig()
  if (!config?.enabled) return

  const span = startSpan({
    operationName: `navigate: ${url || window.location.pathname}`,
    kind: 'internal',
    serviceType: 'browser',
    attributes: {
      'navigation.trigger': trigger,
      'navigation.url': url || window.location.pathname,
      'page.url': window.location.pathname,
    },
  })

  setContext({ traceId: span.traceId, spanId: span.spanId })
  endSpan(span, 'ok')
  getTransport()?.add(span)
}
