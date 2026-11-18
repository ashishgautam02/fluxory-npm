import { startSpan, endSpan, getContext } from '@fluxory/core'
import { getTransport, getNodeConfig } from '../config'

let patched = false

export function patchPg(): void {
  if (patched) return
  patched = true

  try {
    const pg = require('pg')

    const originalQuery = pg.Client.prototype.query
    pg.Client.prototype.query = function patchedQuery(this: { database?: string; connectionParameters?: { database?: string } }, ...args: unknown[]) {
      const config = getNodeConfig()
      if (!config?.enabled) return originalQuery.apply(this, args)

      const queryText = typeof args[0] === 'string' ? args[0] : (args[0] as { text?: string })?.text ?? 'unknown'
      const operation = extractOperation(queryText)
      const db = this.database ?? this.connectionParameters?.database ?? 'postgres'

      const span = startSpan({
        operationName: `pg.${operation}`,
        kind: 'client',
        serviceType: 'database',
        serviceName: `postgres:${db}`,
        parentContext: getContext(),
        attributes: {
          'db.system': 'postgresql',
          'db.name': db,
          'db.operation': operation,
          'db.statement': queryText.slice(0, 200),
        },
      })

      const result = originalQuery.apply(this, args)

      if (result && typeof result.then === 'function') {
        return result.then(
          (val: unknown) => { endSpan(span, 'ok'); getTransport()?.add(span); return val },
          (err: Error) => { endSpan(span, 'error', err.message); getTransport()?.add(span); throw err },
        )
      }

      if (typeof args[args.length - 1] === 'function') {
        const originalCb = args[args.length - 1] as Function
        args[args.length - 1] = (err: Error | null, res: unknown) => {
          if (err) endSpan(span, 'error', err.message)
          else endSpan(span, 'ok')
          getTransport()?.add(span)
          originalCb(err, res)
        }
        return originalQuery.apply(this, args)
      }

      endSpan(span, 'ok')
      getTransport()?.add(span)
      return result
    }

    const originalPoolQuery = pg.Pool.prototype.query
    if (typeof originalPoolQuery === 'function') {
      pg.Pool.prototype.query = function patchedPoolQuery(this: unknown, ...args: unknown[]) {
        return originalPoolQuery.apply(this, args)
      }
    }
  } catch {}
}

function extractOperation(sql: string): string {
  const trimmed = sql.trim().toUpperCase()
  const match = trimmed.match(/^(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|BEGIN|COMMIT|ROLLBACK)/)
  return match ? match[1].toLowerCase() : 'query'
}
