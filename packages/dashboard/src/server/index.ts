import http from 'http'
import fs from 'fs'
import path from 'path'
import { URL } from 'url'
import type { Span, LogEntry } from '@fluxory/core'
import { SpanStore } from './store'
import { WsBroadcaster } from './ws'
import { Collector } from './collector'
import { RateLimiter } from './rate-limiter'
import { Persistence } from './persistence'
import {
  readBody, timingSafeEqual, LoginLimiter, SessionStore,
  setSecurityHeaders, getClientIp, validateSpans, validateLogs, auditLog,
} from './security'

const PORT = parseInt(process.env.FLUXORY_PORT ?? '4000', 10)
const UI_DIR = path.resolve(__dirname, '../ui')
const TRUST_PROXY = process.env.FLUXORY_TRUST_PROXY === 'true'
const CORS_ORIGIN = process.env.FLUXORY_CORS_ORIGIN ?? ''

const AUTH_USER = process.env.FLUXORY_DASH_USER ?? ''
const AUTH_PASS = process.env.FLUXORY_DASH_PASS ?? ''
const AUTH_ENABLED = AUTH_USER.length > 0 && AUTH_PASS.length > 0
const API_KEY = process.env.FLUXORY_API_KEY ?? ''
const API_KEY_ENABLED = API_KEY.length > 0

const sessionStore = new SessionStore()
const loginLimiter = new LoginLimiter()

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
}

function getToken(req: http.IncomingMessage, url: URL): string | null {
  const auth = req.headers['authorization']
  if (auth?.startsWith('Bearer ')) return auth.slice(7)
  return url.searchParams.get('token')
}

function isAuthed(req: http.IncomingMessage, url: URL): boolean {
  if (!AUTH_ENABLED) return true
  const token = getToken(req, url)
  return token != null && sessionStore.has(token)
}

const DB_PATH = process.env.FLUXORY_DB_PATH ?? ''
const INGESTION_ROUTES = new Set(['/api/spans', '/api/logs'])
const rateLimiter = new RateLimiter()
const apiLimiter = new RateLimiter(600)

const persistence = DB_PATH ? new Persistence(DB_PATH) : undefined
const store = new SpanStore(persistence)

function setCorsHeaders(req: http.IncomingMessage, res: http.ServerResponse, isIngestion: boolean): void {
  if (CORS_ORIGIN) {
    const reqOrigin = req.headers.origin ?? ''
    if (reqOrigin === CORS_ORIGIN) {
      res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN)
    }
  } else if (isIngestion) {
    res.setHeader('Access-Control-Allow-Origin', '*')
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key')
  res.setHeader('Vary', 'Origin')
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`)
  const clientIp = getClientIp(req, TRUST_PROXY)

  const isIngestion = INGESTION_ROUTES.has(url.pathname)

  setSecurityHeaders(res)
  setCorsHeaders(req, res, isIngestion)

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }
  const isStaticAsset = !url.pathname.startsWith('/api/')
  const isAuthRoute = url.pathname === '/api/auth/login' || url.pathname === '/api/auth/status' || url.pathname === '/api/auth/logout'

  // Rate limit all API reads (not ingestion, not static, not auth)
  if (!(isIngestion && req.method === 'POST') && !isStaticAsset && !isAuthRoute) {
    if (!apiLimiter.allow(clientIp)) {
      res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': '60' })
      res.end(JSON.stringify({ error: 'Rate limit exceeded' }))
      return
    }
  }

  // --- Auth endpoints ---

  if (req.method === 'POST' && url.pathname === '/api/auth/login') {
    if (!loginLimiter.allow(clientIp)) {
      auditLog('login_blocked', { ip: clientIp, reason: 'rate_limit' })
      res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': '900' })
      res.end(JSON.stringify({ error: 'Too many login attempts. Try again later.' }))
      return
    }

    try {
      const body = await readBody(req, 4096)
      const { username, password } = JSON.parse(body)
      if (typeof username !== 'string' || typeof password !== 'string') {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Invalid request' }))
        return
      }
      if (timingSafeEqual(username, AUTH_USER) && timingSafeEqual(password, AUTH_PASS)) {
        const token = sessionStore.create()
        auditLog('login_success', { ip: clientIp })
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ token }))
      } else {
        auditLog('login_failed', { ip: clientIp })
        res.writeHead(401, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Invalid credentials' }))
      }
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Invalid request' }))
    }
    return
  }

  if (req.method === 'GET' && url.pathname === '/api/auth/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ authRequired: AUTH_ENABLED, authenticated: isAuthed(req, url) }))
    return
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/logout') {
    const token = getToken(req, url)
    if (token) sessionStore.delete(token)
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true }))
    return
  }

  // --- Ingestion endpoints ---

  if (isIngestion && req.method === 'POST') {
    if (API_KEY_ENABLED) {
      const provided = (req.headers['x-api-key'] ?? '') as string
      if (!timingSafeEqual(provided, API_KEY)) {
        auditLog('apikey_rejected', { ip: clientIp, path: url.pathname })
        res.writeHead(403, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Invalid API key' }))
        return
      }
    }
    if (!rateLimiter.allow(clientIp)) {
      res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': '60' })
      res.end(JSON.stringify({ error: 'Rate limit exceeded' }))
      return
    }
  }

  // --- Auth gate for dashboard API ---

  if (!(isIngestion && req.method === 'POST') && !isStaticAsset && !isAuthed(req, url)) {
    res.writeHead(401, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Unauthorized' }))
    return
  }

  // --- API routes ---

  if (req.method === 'POST' && url.pathname === '/api/spans') {
    try {
      const body = await readBody(req)
      const parsed = JSON.parse(body)
      const { valid, error } = validateSpans(parsed)
      if (!valid) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error }))
        return
      }
      const spans: Span[] = parsed
      collector.ingest(spans)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ accepted: spans.length }))
    } catch (e) {
      const msg = e instanceof Error && e.message === 'Payload too large' ? 'Payload too large' : 'Invalid JSON'
      const code = msg === 'Payload too large' ? 413 : 400
      res.writeHead(code, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: msg }))
    }
    return
  }

  if (req.method === 'GET' && url.pathname === '/api/traces') {
    const limit = Math.min(Math.max(1, parseInt(url.searchParams.get('limit') ?? '50', 10) || 50), 200)
    const offset = Math.max(0, parseInt(url.searchParams.get('offset') ?? '0', 10) || 0)
    const traces = store.getTraces(limit, offset)
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(traces))
    return
  }

  if (req.method === 'GET' && url.pathname.startsWith('/api/traces/')) {
    const traceId = url.pathname.split('/')[3]
    if (!traceId || traceId.length > 128) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Invalid trace ID' }))
      return
    }
    const trace = store.getTrace(traceId)
    if (trace) {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(trace))
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Trace not found' }))
    }
    return
  }

  if (req.method === 'GET' && url.pathname === '/api/topology') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(store.getTopology()))
    return
  }

  if (req.method === 'GET' && url.pathname === '/api/stats') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(store.getStats()))
    return
  }

  if (req.method === 'POST' && url.pathname === '/api/logs') {
    try {
      const body = await readBody(req)
      const parsed = JSON.parse(body)
      const { valid, error } = validateLogs(parsed)
      if (!valid) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error }))
        return
      }
      const logs: LogEntry[] = parsed
      collector.ingestLogs(logs)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ accepted: logs.length }))
    } catch (e) {
      const msg = e instanceof Error && e.message === 'Payload too large' ? 'Payload too large' : 'Invalid JSON'
      const code = msg === 'Payload too large' ? 413 : 400
      res.writeHead(code, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: msg }))
    }
    return
  }

  if (req.method === 'GET' && url.pathname === '/api/logs') {
    const service = url.searchParams.get('service') ?? undefined
    const level = url.searchParams.get('level') ?? undefined
    const search = url.searchParams.get('search') ?? undefined
    const limit = Math.min(Math.max(1, parseInt(url.searchParams.get('limit') ?? '200', 10) || 200), 1000)
    const logs = store.getLogs({ service, level, search, limit })
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(logs))
    return
  }

  if (req.method === 'GET' && url.pathname === '/api/settings') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(store.getSettings()))
    return
  }

  if (req.method === 'PUT' && url.pathname === '/api/settings') {
    try {
      const body = await readBody(req, 4096)
      const patch = JSON.parse(body)
      const updated = store.updateSettings(patch)
      broadcaster.broadcastSettings(updated)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(updated))
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Invalid JSON' }))
    }
    return
  }

  if (req.method === 'GET' && url.pathname === '/api/services') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(store.getServiceNames()))
    return
  }

  if (req.method === 'POST' && url.pathname === '/api/clear') {
    auditLog('data_cleared', { ip: clientIp })
    store.clear()
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ cleared: true }))
    return
  }

  serveStatic(url.pathname, res)
})

function serveStatic(pathname: string, res: http.ServerResponse): void {
  let filePath = pathname === '/' ? '/index.html' : pathname
  const fullPath = path.resolve(UI_DIR, '.' + filePath)

  if (!fullPath.startsWith(UI_DIR)) {
    res.writeHead(403)
    res.end('Forbidden')
    return
  }

  if (!fs.existsSync(fullPath)) {
    const indexPath = path.join(UI_DIR, 'index.html')
    if (fs.existsSync(indexPath)) {
      res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-cache' })
      res.end(fs.readFileSync(indexPath))
      return
    }
    res.writeHead(404)
    res.end('Not found')
    return
  }

  const ext = path.extname(fullPath)
  const mime = MIME_TYPES[ext] ?? 'application/octet-stream'
  const isHtml = ext === '.html'
  res.writeHead(200, {
    'Content-Type': mime,
    'Cache-Control': isHtml ? 'no-cache' : 'public, max-age=31536000, immutable',
  })
  fs.createReadStream(fullPath).pipe(res)
}

const broadcaster = new WsBroadcaster(server, store, (req) => {
  if (!AUTH_ENABLED) return true
  const wsUrl = new URL(req.url ?? '/', `http://localhost:${PORT}`)
  const token = wsUrl.searchParams.get('token')
  return token != null && sessionStore.has(token)
})
const collector = new Collector(store, broadcaster)

async function start(): Promise<void> {
  await store.restore()

  server.listen(PORT, () => {
    console.log(`  Dashboard:  http://localhost:${PORT}`)
    console.log(`  Collector:  http://localhost:${PORT}/api/spans`)
    console.log(`  WebSocket:  ws://localhost:${PORT}/ws`)
    if (DB_PATH) console.log(`  Database:   ${DB_PATH}`)
    if (AUTH_ENABLED) console.log(`  Auth:       dashboard login enabled`)
    if (API_KEY_ENABLED) console.log(`  API Key:    ingestion key required`)
    if (TRUST_PROXY) console.log(`  Proxy:      trusting X-Forwarded-For`)
    console.log()
    console.log('  Waiting for spans...')
    console.log()
  })
}

start()

function shutdown(): void {
  collector.destroy()
  store.destroy()
  rateLimiter.destroy()
  apiLimiter.destroy()
  loginLimiter.destroy()
  sessionStore.destroy()
  server.close()
  process.exit(0)
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
