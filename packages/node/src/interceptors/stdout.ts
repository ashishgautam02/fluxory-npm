import type { LogLevel, LogEntry } from '@fluxory/core'
import { getContext } from '@fluxory/core'
import { getLogTransport, getNodeConfig } from '../config'

const ANSI_RE = /\x1b\[[0-9;]*m/g

const LEVEL_PATTERNS: Array<{ re: RegExp; level: LogLevel }> = [
  // Stack traces and thrown errors
  { re: /^\s*(at\s+|Error:|TypeError:|RangeError:|ReferenceError:|SyntaxError:|UnhandledPromiseRejection)/, level: 'error' },
  // Structured logger patterns: "[timestamp] error:", "error:", "[ERROR]", "ERR!", "FATAL"
  { re: /\]\s*error\s*:/i, level: 'error' },
  { re: /\berror\s*[:!]|\bERROR\b|\bERR!|\bfatal\b|\bFATAL\b|\bcrit(?:ical)?\b|\bfailed\b/i, level: 'error' },
  { re: /❌|✗/, level: 'error' },
  // Warnings
  { re: /\]\s*warn(?:ing)?\s*:/i, level: 'warn' },
  { re: /\bwarn(?:ing)?\s*[:!]|\bWARN(?:ING)?\b|\bdeprecated\b/i, level: 'warn' },
  { re: /⚠/, level: 'warn' },
  // Debug/verbose
  { re: /\]\s*debug\s*:/i, level: 'debug' },
  { re: /\bdebug\s*[:!]|\bDEBUG\b|\bverbose\b|\bVERBOSE\b/i, level: 'debug' },
  // Info (explicit markers only — unmarked stdout defaults to info anyway)
  { re: /\]\s*info\s*:/i, level: 'info' },
  { re: /\binfo\s*[:!]|\bINFO\b/, level: 'info' },
  { re: /✅|✓/, level: 'info' },
]

function detectLevel(text: string, isStderr: boolean): LogLevel {
  for (const { re, level } of LEVEL_PATTERNS) {
    if (re.test(text)) return level
  }
  return isStderr ? 'error' : 'info'
}

function clean(text: string): string {
  return text.replace(ANSI_RE, '').trimEnd()
}

let patched = false
let capturing = false

export function patchStdout(): void {
  if (patched) return
  patched = true

  const origStdoutWrite = process.stdout.write.bind(process.stdout) as typeof process.stdout.write
  const origStderrWrite = process.stderr.write.bind(process.stderr) as typeof process.stderr.write

  function intercept(chunk: unknown, isStderr: boolean): void {
    if (capturing) return
    const transport = getLogTransport()
    if (!transport) return

    const raw = typeof chunk === 'string' ? chunk : (chunk as Buffer).toString('utf8')
    const lines = raw.split('\n')

    const config = getNodeConfig()
    const serviceName = config?.serviceName ?? 'node-service'
    const serviceType = config?.serviceType ?? 'server'

    capturing = true
    try {
      for (const line of lines) {
        const cleaned = clean(line)
        if (!cleaned) continue

        const ctx = getContext()
        const entry: LogEntry = {
          timestamp: Date.now(),
          level: detectLevel(cleaned, isStderr),
          message: cleaned,
          serviceName,
          serviceType,
          traceId: ctx?.traceId,
          spanId: ctx?.spanId,
        }
        transport.add(entry)
      }
    } finally {
      capturing = false
    }
  }

  process.stdout.write = function (chunk: any, ...args: any[]): boolean {
    intercept(chunk, false)
    return (origStdoutWrite as any)(chunk, ...args)
  } as typeof process.stdout.write

  process.stderr.write = function (chunk: any, ...args: any[]): boolean {
    intercept(chunk, true)
    return (origStderrWrite as any)(chunk, ...args)
  } as typeof process.stderr.write
}
