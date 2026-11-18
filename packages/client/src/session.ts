import { generateTraceId, generateSpanId } from '@fluxory/core'

let sessionId: string | null = null
let sessionSpanId: string | null = null

export function getSessionId(): string {
  if (!sessionId) {
    sessionId = generateTraceId()
    sessionSpanId = generateSpanId()
  }
  return sessionId
}

export function getSessionSpanId(): string {
  if (!sessionSpanId) {
    getSessionId()
  }
  return sessionSpanId!
}

export function getPageUrl(): string {
  return typeof window !== 'undefined' ? window.location.pathname : '/'
}

export function getElementDescriptor(el: Element): string {
  const tag = el.tagName.toLowerCase()
  const id = el.id ? `#${el.id}` : ''
  const cls = el.className && typeof el.className === 'string'
    ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}`
    : ''
  const text = (el.textContent ?? '').trim().slice(0, 30)
  const label = text ? ` "${text}"` : ''
  return `${tag}${id}${cls}${label}`
}
