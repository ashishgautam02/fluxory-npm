import type { Span, LogEntry, FluxorySettings } from '@fluxory/core'
import fs from 'fs'
import path from 'path'

let initSqlJs: typeof import('sql.js').default
let Database: import('sql.js').SqlJsStatic['Database'] | null = null

interface SqlJsDatabase {
  run(sql: string, params?: unknown[]): void
  exec(sql: string): { columns: string[]; values: unknown[][] }[]
  export(): Uint8Array
  close(): void
}

export class Persistence {
  private db: SqlJsDatabase | null = null
  private dbPath: string
  private saveTimer: ReturnType<typeof setInterval> | null = null
  private dirty = false
  ready: Promise<void>

  constructor(dbPath: string) {
    this.dbPath = dbPath
    this.ready = this.init()
  }

  private async init(): Promise<void> {
    const SQL = await import('sql.js')
    const sqljs = await SQL.default()

    let buffer: Buffer | undefined
    if (fs.existsSync(this.dbPath)) {
      buffer = fs.readFileSync(this.dbPath)
    }

    this.db = buffer
      ? new sqljs.Database(buffer) as unknown as SqlJsDatabase
      : new sqljs.Database() as unknown as SqlJsDatabase

    this.db.run(`CREATE TABLE IF NOT EXISTS spans (
      traceId TEXT NOT NULL,
      spanId TEXT NOT NULL PRIMARY KEY,
      data TEXT NOT NULL,
      startTime INTEGER NOT NULL
    )`)

    this.db.run(`CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      data TEXT NOT NULL,
      timestamp INTEGER NOT NULL
    )`)

    this.db.run(`CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )`)

    this.db.run(`CREATE INDEX IF NOT EXISTS idx_spans_trace ON spans(traceId)`)
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_spans_time ON spans(startTime)`)
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_logs_time ON logs(timestamp)`)

    const dir = path.dirname(this.dbPath)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

    this.saveTimer = setInterval(() => this.saveToDisk(), 5_000)
  }

  saveSpan(span: Span): void {
    if (!this.db) return
    this.db.run(
      `INSERT OR REPLACE INTO spans (traceId, spanId, data, startTime) VALUES (?, ?, ?, ?)`,
      [span.traceId, span.spanId, JSON.stringify(span), span.startTime]
    )
    this.dirty = true
  }

  saveLog(log: LogEntry): void {
    if (!this.db) return
    this.db.run(
      `INSERT INTO logs (data, timestamp) VALUES (?, ?)`,
      [JSON.stringify(log), log.timestamp]
    )
    this.dirty = true
  }

  saveSettings(settings: FluxorySettings): void {
    if (!this.db) return
    this.db.run(
      `INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`,
      ['settings', JSON.stringify(settings)]
    )
    this.dirty = true
    this.saveToDisk()
  }

  loadSpans(): Span[] {
    if (!this.db) return []
    const results = this.db.exec(`SELECT data FROM spans ORDER BY startTime ASC`)
    if (!results.length) return []
    return results[0].values.map(row => JSON.parse(row[0] as string))
  }

  loadLogs(): LogEntry[] {
    if (!this.db) return []
    const results = this.db.exec(`SELECT data FROM logs ORDER BY timestamp ASC`)
    if (!results.length) return []
    return results[0].values.map(row => JSON.parse(row[0] as string))
  }

  loadSettings(): FluxorySettings | null {
    if (!this.db) return null
    const results = this.db.exec(`SELECT value FROM settings WHERE key = 'settings'`)
    if (!results.length || !results[0].values.length) return null
    return JSON.parse(results[0].values[0][0] as string)
  }

  applyRetention(cutoffMs: number, maxLogs: number): void {
    if (!this.db) return
    this.db.run(`DELETE FROM spans WHERE startTime < ?`, [cutoffMs])
    this.db.run(`DELETE FROM logs WHERE id NOT IN (SELECT id FROM logs ORDER BY timestamp DESC LIMIT ?)`, [maxLogs])
    this.dirty = true
  }

  clear(): void {
    if (!this.db) return
    this.db.run(`DELETE FROM spans`)
    this.db.run(`DELETE FROM logs`)
    this.dirty = true
    this.saveToDisk()
  }

  private saveToDisk(): void {
    if (!this.db || !this.dirty) return
    try {
      const data = this.db.export()
      fs.writeFileSync(this.dbPath, Buffer.from(data))
      this.dirty = false
    } catch {}
  }

  destroy(): void {
    if (this.saveTimer) clearInterval(this.saveTimer)
    this.saveToDisk()
    this.db?.close()
    this.db = null
  }
}
