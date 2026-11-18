import { startSpan, endSpan, getContext } from '@fluxory/core'
import { getTransport, getNodeConfig } from '../config'

let patched = false

export function patchSequelize(): void {
  if (patched) return
  patched = true

  try {
    const { Sequelize } = require('sequelize')
    if (!Sequelize?.prototype) return

    const originalQuery = Sequelize.prototype.query
    Sequelize.prototype.query = async function patchedQuery(
      this: { config?: { database?: string }; options?: { dialect?: string } },
      sql: string | { query: string },
      options?: { type?: string; model?: { name?: string } },
      ...rest: unknown[]
    ) {
      const config = getNodeConfig()
      if (!config?.enabled) return originalQuery.call(this, sql, options, ...rest)

      const queryText = typeof sql === 'string' ? sql : sql.query ?? 'unknown'
      const operation = extractOperation(queryText)
      const db = this.config?.database ?? 'sequelize'
      const dialect = this.options?.dialect ?? 'sql'
      const model = options?.model?.name

      const span = startSpan({
        operationName: model ? `sequelize.${model}.${operation}` : `sequelize.${operation}`,
        kind: 'client',
        serviceType: 'database',
        serviceName: `${dialect}:${db}`,
        parentContext: getContext(),
        attributes: {
          'db.system': dialect,
          'db.name': db,
          'db.operation': operation,
          'db.statement': queryText.slice(0, 200),
          ...(model ? { 'db.collection': model } : {}),
        },
      })

      try {
        const result = await originalQuery.call(this, sql, options, ...rest)
        endSpan(span, 'ok')
        getTransport()?.add(span)
        return result
      } catch (err) {
        endSpan(span, 'error', err instanceof Error ? err.message : String(err))
        getTransport()?.add(span)
        throw err
      }
    }
  } catch {}
}

function extractOperation(sql: string): string {
  const trimmed = sql.trim().toUpperCase()
  const match = trimmed.match(/^(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|BEGIN|COMMIT|ROLLBACK|SHOW|DESCRIBE)/)
  return match ? match[1].toLowerCase() : 'query'
}
