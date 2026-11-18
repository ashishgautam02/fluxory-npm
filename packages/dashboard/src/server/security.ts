import crypto from 'crypto'
import type { IncomingMessage, ServerResponse } from 'http'

const MAX_BODY_BYTES = 2 * 1024 * 1024 // 2MB

export function readBody(req: IncomingMessage, maxBytes = MAX_BODY_BYTES): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > maxBytes) {
        req.destroy()
        reject(new Error('Payload too large'))
      } else {
        chunks.push(chunk)
      }
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString()))
    req.on('error', reject)
  })
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    crypto.timingSafeEqual(Buffer.alloc(32), Buffer.alloc(32))
    return false
  }
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

const LOGIN_WINDOW_MS = 15 * 60_000
const MAX_LOGIN_ATTEMPTS = 10

interface LoginBucket {
  count: number
  resetAt: number
  lockedUntil: number
}

export class LoginLimiter {
  private buckets = new Map<string, LoginBucket>()
  private cleanupTimer: ReturnType<typeof setInterval>

  constructor() {
    this.cleanupTimer = setInterval(() => this.cleanup(), 60_000)
  }

  allow(ip: string): boolean {
    const now = Date.now()
    let bucket = this.buckets.get(ip)

    if (bucket && now < bucket.lockedUntil) return false

    if (!bucket || now >= bucket.resetAt) {
      bucket = { count: 0, resetAt: now + LOGIN_WINDOW_MS, lockedUntil: 0 }
      this.buckets.set(ip, bucket)
    }

    bucket.count++

    if (bucket.count > MAX_LOGIN_ATTEMPTS) {
      bucket.lockedUntil = now + LOGIN_WINDOW_MS
      return false
    }

    return true
  }

  remaining(ip: string): number {
    const bucket = this.buckets.get(ip)
    if (!bucket || Date.now() >= bucket.resetAt) return MAX_LOGIN_ATTEMPTS
    return Math.max(0, MAX_LOGIN_ATTEMPTS - bucket.count)
  }

  private cleanup(): void {
    const now = Date.now()
    for (const [ip, bucket] of this.buckets) {
      if (now >= bucket.resetAt && now >= bucket.lockedUntil) this.buckets.delete(ip)
    }
  }

  destroy(): void {
    clearInterval(this.cleanupTimer)
  }
}

const SESSION_TTL_MS = parseInt(process.env.FLUXORY_SESSION_TTL ?? '', 10) * 60_000 || 24 * 60 * 60_000

interface SessionEntry {
  createdAt: number
}

export class SessionStore {
  private sessions = new Map<string, SessionEntry>()
  private cleanupTimer: ReturnType<typeof setInterval>

  constructor() {
    this.cleanupTimer = setInterval(() => this.cleanup(), 60_000)
  }

  create(): string {
    const token = crypto.randomBytes(32).toString('hex')
    this.sessions.set(token, { createdAt: Date.now() })
    return token
  }

  has(token: string): boolean {
    const entry = this.sessions.get(token)
    if (!entry) return false
    if (Date.now() - entry.createdAt > SESSION_TTL_MS) {
      this.sessions.delete(token)
      return false
    }
    return true
  }

  delete(token: string): void {
    this.sessions.delete(token)
  }

  private cleanup(): void {
    const now = Date.now()
    for (const [token, entry] of this.sessions) {
      if (now - entry.createdAt > SESSION_TTL_MS) this.sessions.delete(token)
    }
  }

  destroy(): void {
    clearInterval(this.cleanupTimer)
  }
}

export function setSecurityHeaders(res: ServerResponse): void {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('X-XSS-Protection', '1; mode=block')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws: wss:; img-src 'self' data:;")
}

export function getClientIp(req: IncomingMessage, trustProxy: boolean): string {
  if (trustProxy) {
    const forwarded = req.headers['x-forwarded-for']
    if (typeof forwarded === 'string') {
      const first = forwarded.split(',')[0]?.trim()
      if (first) return first
    }
  }
  return req.socket.remoteAddress ?? 'unknown'
}

export function validateSpans(data: unknown): { valid: boolean; spans: unknown[]; error?: string } {
  if (!Array.isArray(data)) return { valid: false, spans: [], error: 'Body must be an array' }
  if (data.length > 1000) return { valid: false, spans: [], error: 'Max 1000 items per batch' }
  for (const item of data) {
    if (typeof item !== 'object' || item === null) return { valid: false, spans: [], error: 'Each item must be an object' }
    const s = item as Record<string, unknown>
    if (typeof s.traceId !== 'string' || typeof s.spanId !== 'string' || typeof s.operationName !== 'string' || typeof s.serviceName !== 'string') {
      return { valid: false, spans: [], error: 'Missing required fields: traceId, spanId, operationName, serviceName' }
    }
  }
  return { valid: true, spans: data }
}

export function validateLogs(data: unknown): { valid: boolean; logs: unknown[]; error?: string } {
  if (!Array.isArray(data)) return { valid: false, logs: [], error: 'Body must be an array' }
  if (data.length > 1000) return { valid: false, logs: [], error: 'Max 1000 items per batch' }
  for (const item of data) {
    if (typeof item !== 'object' || item === null) return { valid: false, logs: [], error: 'Each item must be an object' }
    const l = item as Record<string, unknown>
    if (typeof l.message !== 'string' || typeof l.timestamp !== 'number') {
      return { valid: false, logs: [], error: 'Missing required fields: message, timestamp' }
    }
  }
  return { valid: true, logs: data }
}

export function auditLog(event: string, details: Record<string, unknown>): void {
  const ts = new Date().toISOString()
  const msg = Object.entries(details).map(([k, v]) => `${k}=${v}`).join(' ')
  console.log(`  [security] ${ts} ${event} ${msg}`)
}
