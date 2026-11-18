import { startSpan, endSpan, getContext } from '@fluxory/core'
import { getTransport, getNodeConfig } from '../config'

let patched = false

export function patchTypeORM(): void {
  if (patched) return
  patched = true

  try {
    const typeorm = require('typeorm')

    const DataSource = typeorm.DataSource
    if (DataSource?.prototype) {
      const originalInitialize = DataSource.prototype.initialize
      DataSource.prototype.initialize = async function patchedInitialize(this: {
        driver?: { options?: { database?: string }; type?: string }
        options?: { type?: string; database?: string }
      }, ...args: unknown[]) {
        const result = await originalInitialize.apply(this, args)
        patchQueryRunner(typeorm)
        return result
      }
    }

    patchQueryRunner(typeorm)

    if (typeorm.EntityManager?.prototype) {
      const originalManagerQuery = typeorm.EntityManager.prototype.query
      if (typeof originalManagerQuery === 'function') {
        typeorm.EntityManager.prototype.query = async function patchedManagerQuery(
          this: { connection?: { options?: { type?: string; database?: string } } },
          queryStr: string,
          ...rest: unknown[]
        ) {
          const config = getNodeConfig()
          if (!config?.enabled) return originalManagerQuery.call(this, queryStr, ...rest)

          const operation = extractOperation(queryStr)
          const dbType = this.connection?.options?.type ?? 'sql'
          const db = this.connection?.options?.database ?? 'typeorm'

          const span = startSpan({
            operationName: `typeorm.${operation}`,
            kind: 'client',
            serviceType: 'database',
            serviceName: `${dbType}:${db}`,
            parentContext: getContext(),
            attributes: {
              'db.system': dbType,
              'db.name': db,
              'db.operation': operation,
              'db.statement': queryStr.slice(0, 200),
            },
          })

          try {
            const result = await originalManagerQuery.call(this, queryStr, ...rest)
            endSpan(span, 'ok')
            getTransport()?.add(span)
            return result
          } catch (err) {
            endSpan(span, 'error', err instanceof Error ? err.message : String(err))
            getTransport()?.add(span)
            throw err
          }
        }
      }
    }
  } catch {}
}

function patchQueryRunner(typeorm: { QueryRunner?: { prototype: { query?: Function } } }): void {
  const QueryRunner = typeorm.QueryRunner
  if (!QueryRunner?.prototype?.query) return

  const original = QueryRunner.prototype.query
  if ((original as { _fluxoryPatched?: boolean })._fluxoryPatched) return

  QueryRunner.prototype.query = async function patchedRunnerQuery(
    this: { connection?: { options?: { type?: string; database?: string } } },
    queryStr: string,
    ...rest: unknown[]
  ) {
    const config = getNodeConfig()
    if (!config?.enabled) return original.call(this, queryStr, ...rest)

    const operation = extractOperation(queryStr)
    const dbType = this.connection?.options?.type ?? 'sql'
    const db = this.connection?.options?.database ?? 'typeorm'

    const span = startSpan({
      operationName: `typeorm.${operation}`,
      kind: 'client',
      serviceType: 'database',
      serviceName: `${dbType}:${db}`,
      parentContext: getContext(),
      attributes: {
        'db.system': dbType,
        'db.name': db,
        'db.operation': operation,
        'db.statement': queryStr.slice(0, 200),
      },
    })

    try {
      const result = await original.call(this, queryStr, ...rest)
      endSpan(span, 'ok')
      getTransport()?.add(span)
      return result
    } catch (err) {
      endSpan(span, 'error', err instanceof Error ? err.message : String(err))
      getTransport()?.add(span)
      throw err
    }
  }

  ;(QueryRunner.prototype.query as { _fluxoryPatched?: boolean })._fluxoryPatched = true
}

function extractOperation(sql: string): string {
  const trimmed = sql.trim().toUpperCase()
  const match = trimmed.match(/^(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|BEGIN|COMMIT|ROLLBACK)/)
  return match ? match[1].toLowerCase() : 'query'
}
