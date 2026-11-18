import { startSpan, endSpan, setContext } from '@fluxory/core'
import { getTransport, getClientConfig } from '../config'
import { getElementDescriptor } from '../session'

let attached = false

export function patchClicks(): void {
  if (attached || typeof document === 'undefined') return
  attached = true

  document.addEventListener('click', (event) => {
    const config = getClientConfig()
    if (!config?.enabled) return

    const target = event.target
    if (!(target instanceof Element)) return

    const interactive = target.closest('a, button, [role="button"], input[type="submit"], [data-fluxory]')
    if (!interactive) return

    const descriptor = getElementDescriptor(interactive)
    const span = startSpan({
      operationName: `click: ${descriptor}`,
      kind: 'internal',
      serviceType: 'browser',
      attributes: {
        'interaction.type': 'click',
        'interaction.element': descriptor,
        'interaction.tag': interactive.tagName.toLowerCase(),
        'page.url': window.location.pathname,
      },
    })

    setContext({ traceId: span.traceId, spanId: span.spanId })
    endSpan(span, 'ok')
    getTransport()?.add(span)
  }, { capture: true, passive: true })
}
