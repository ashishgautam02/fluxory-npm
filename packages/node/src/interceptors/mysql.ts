import { startSpan, endSpan, getContext } from '@fluxory/core'
import { getTransport, getNodeConfig } from '../config'

let patched = false

export function patchMySQL(): void {
  if (patched) return
  patched = true

  try {
    const mysql2 = require('mysql2')
    patchConnection(mysql2.Connection?.prototype)
  } catch {}

  try {
    const mysql2Promise = require('mysql2/promise')
    patchPromiseConnection(mysql2Promise)
  } catch {}
}

function patchConnection(proto: { query?: Function; execute?: Function } | undefined): void {
  if (!proto) return

  if (typeof proto.query === 'function') {
    const originalQuery = proto.query
    proto.query = function patchedQuery(this: { config?: { database?: string } }, ...args: unknown[]) {
      const config = getNodeConfig()
      if (!config?.enabled) return originalQuery.apply(this, args)

      const sql = typeof args[0] === 'string' ? args[0] : (args[0] as { sql?: string })?.sql ?? 'unknown'
      const operation = extractOperation(sql)
      const db = this.config?.database ?? 'mysql'

      const span = startSpan({
        operationName: `mysql.${operation}`,
        kind: 'client',
        serviceType: 'database',
        serviceName: `mysql:${db}`,
        parentContext: getContext(),
        attributes: {
          'db.system': 'mysql',
          'db.name': db,
          'db.operation': operation,
          'db.statement': sql.slice(0, 200),
        },
      })

      const lastArg = args[args.length - 1]
      if (typeof lastArg === 'function') {
        args[args.length - 1] = (err: Error | null, ...rest: unknown[]) => {
          if (err) endSpan(span, 'error', err.message)
          else endSpan(span, 'ok')
          getTransport()?.add(span)
          ;(lastArg as Function)(err, ...rest)
        }
      }

      const result = originalQuery.apply(this, args)

      if (result && typeof result.then === 'function') {
        return result.then(
          (val: unknown) => { endSpan(span, 'ok'); getTransport()?.add(span); return val },
          (err: Error) => { endSpan(span, 'error', err.message); getTransport()?.add(span); throw err },
        )
      }

      return result
    }
  }

  if (typeof proto.execute === 'function') {
    const originalExecute = proto.execute
    proto.execute = function patchedExecute(this: { config?: { database?: string } }, ...args: unknown[]) {
      const config = getNodeConfig()
      if (!config?.enabled) return originalExecute.apply(this, args)

      const sql = typeof args[0] === 'string' ? args[0] : 'prepared'
      const operation = extractOperation(sql)
      const db = this.config?.database ?? 'mysql'

      const span = startSpan({
        operationName: `mysql.${operation}`,
        kind: 'client',
        serviceType: 'database',
        serviceName: `mysql:${db}`,
        parentContext: getContext(),
        attributes: {
          'db.system': 'mysql',
          'db.name': db,
          'db.operation': operation,
          'db.statement': sql.slice(0, 200),
        },
      })

      const lastArg = args[args.length - 1]
      if (typeof lastArg === 'function') {
        args[args.length - 1] = (err: Error | null, ...rest: unknown[]) => {
          if (err) endSpan(span, 'error', err.message)
          else endSpan(span, 'ok')
          getTransport()?.add(span)
          ;(lastArg as Function)(err, ...rest)
        }
      }

      const result = originalExecute.apply(this, args)

      if (result && typeof result.then === 'function') {
        return result.then(
          (val: unknown) => { endSpan(span, 'ok'); getTransport()?.add(span); return val },
          (err: Error) => { endSpan(span, 'error', err.message); getTransport()?.add(span); throw err },
        )
      }

      return result
    }
  }
}

function patchPromiseConnection(mod: { createConnection?: Function; createPool?: Function }): void {
  if (typeof mod.createConnection === 'function') {
    const original = mod.createConnection
    mod.createConnection = async function patchedCreateConnection(...args: unknown[]) {
      const conn = await original.apply(this, args)
      patchConnection(Object.getPrototypeOf(conn))
      return conn
    }
  }

  if (typeof mod.createPool === 'function') {
    const original = mod.createPool
    mod.createPool = function patchedCreatePool(...args: unknown[]) {
      const pool = original.apply(this, args)
      patchConnection(Object.getPrototypeOf(pool))
      return pool
    }
  }
}

function extractOperation(sql: string): string {
  const trimmed = sql.trim().toUpperCase()
  const match = trimmed.match(/^(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|BEGIN|COMMIT|ROLLBACK)/)
  return match ? match[1].toLowerCase() : 'query'
}
