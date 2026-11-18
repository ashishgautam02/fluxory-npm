import type { Span, FluxoryConfig, LogEntry } from './types'

type SendFn = (url: string, body: string) => Promise<void>

let customSend: SendFn | null = null

export function setSendFunction(fn: SendFn): void {
  customSend = fn
}

let activeApiKey = ''

export function setApiKey(key: string): void {
  activeApiKey = key
}

async function defaultSend(url: string, body: string): Promise<void> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (activeApiKey) headers['X-API-Key'] = activeApiKey

  if (typeof globalThis.fetch === 'function') {
    await globalThis.fetch(url, {
      method: 'POST',
      headers,
      body,
      keepalive: true,
    }).catch(() => {})
  } else {
    try {
      const http = await import('http')
      const url_ = new URL(url)
      const nodeHeaders: Record<string, string | number> = {
        ...headers,
        'Content-Length': Buffer.byteLength(body),
      }
      const req = http.request({
        hostname: url_.hostname,
        port: url_.port,
        path: url_.pathname,
        method: 'POST',
        headers: nodeHeaders,
      })
      req.on('error', () => {})
      req.write(body)
      req.end()
    } catch {}
  }
}

export class SpanTransport {
  private buffer: Span[] = []
  private timer: ReturnType<typeof setTimeout> | null = null
  private config: FluxoryConfig

  constructor(config: FluxoryConfig) {
    this.config = config
  }

  add(span: Span): void {
    if (!this.config.enabled) return
    if (this.config.sampleRate < 1 && Math.random() > this.config.sampleRate) return

    this.buffer.push(span)

    if (this.buffer.length >= this.config.batchSize) {
      this.flush()
    } else if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), this.config.flushInterval)
    }
  }

  flush(): void {
    if (!this.buffer.length) return

    const batch = this.buffer.splice(0)
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }

    const body = JSON.stringify(batch)
    const send = customSend ?? defaultSend
    send(`${this.config.collectorUrl}/api/spans`, body).catch(() => {})
  }

  destroy(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    this.flush()
  }
}

export class LogTransport {
  private buffer: LogEntry[] = []
  private timer: ReturnType<typeof setTimeout> | null = null
  private config: FluxoryConfig

  constructor(config: FluxoryConfig) {
    this.config = config
  }

  add(log: LogEntry): void {
    if (!this.config.enabled) return
    this.buffer.push(log)

    if (this.buffer.length >= this.config.batchSize) {
      this.flush()
    } else if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), this.config.flushInterval)
    }
  }

  flush(): void {
    if (!this.buffer.length) return
    const batch = this.buffer.splice(0)
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    const body = JSON.stringify(batch)
    const send = customSend ?? defaultSend
    send(`${this.config.collectorUrl}/api/logs`, body).catch(() => {})
  }

  destroy(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    this.flush()
  }
}
