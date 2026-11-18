import { startSpan, endSpan, getContext } from '@fluxory/core'
import { getTransport, getNodeConfig } from '../config'

let patched = false

export function patchGraphQL(): void {
  if (patched) return
  patched = true

  try {
    const graphql = require('graphql')
    patchExecute(graphql)
  } catch {}
}

function patchExecute(graphql: { execute?: Function; graphql?: Function }): void {
  if (typeof graphql.execute === 'function') {
    const originalExecute = graphql.execute
    graphql.execute = function patchedExecute(...args: unknown[]) {
      const config = getNodeConfig()
      if (!config?.enabled) return originalExecute.apply(this, args)

      const operationInfo = extractOperationInfo(args[0])

      const span = startSpan({
        operationName: `graphql.${operationInfo.type}${operationInfo.name ? `:${operationInfo.name}` : ''}`,
        kind: 'server',
        serviceType: 'server',
        serviceName: 'graphql',
        parentContext: getContext(),
        attributes: {
          'graphql.operation.type': operationInfo.type,
          ...(operationInfo.name ? { 'graphql.operation.name': operationInfo.name } : {}),
        },
      })

      const result = originalExecute.apply(this, args)

      if (result && typeof result.then === 'function') {
        return result.then(
          (val: { errors?: unknown[] }) => {
            const hasErrors = val?.errors && val.errors.length > 0
            if (hasErrors) {
              span.attributes['graphql.errors'] = val.errors!.length
              endSpan(span, 'error', `${val.errors!.length} GraphQL error(s)`)
            } else {
              endSpan(span, 'ok')
            }
            getTransport()?.add(span)
            return val
          },
          (err: Error) => {
            endSpan(span, 'error', err.message)
            getTransport()?.add(span)
            throw err
          },
        )
      }

      endSpan(span, 'ok')
      getTransport()?.add(span)
      return result
    }
  }

  if (typeof graphql.graphql === 'function') {
    const originalGraphql = graphql.graphql
    graphql.graphql = async function patchedGraphql(...args: unknown[]) {
      const config = getNodeConfig()
      if (!config?.enabled) return originalGraphql.apply(this, args)

      const source = typeof args[1] === 'string' ? args[1] : ''
      const opType = source.trim().startsWith('mutation') ? 'mutation' : 'query'

      const span = startSpan({
        operationName: `graphql.${opType}`,
        kind: 'server',
        serviceType: 'server',
        serviceName: 'graphql',
        parentContext: getContext(),
        attributes: { 'graphql.operation.type': opType },
      })

      try {
        const result = await originalGraphql.apply(this, args) as { errors?: unknown[] }
        const hasErrors = result?.errors && result.errors.length > 0
        if (hasErrors) {
          span.attributes['graphql.errors'] = result.errors!.length
          endSpan(span, 'error', `${result.errors!.length} GraphQL error(s)`)
        } else {
          endSpan(span, 'ok')
        }
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

function extractOperationInfo(schemaOrArgs: unknown): { type: string; name: string } {
  try {
    const args = schemaOrArgs as { document?: { definitions?: Array<{ operation?: string; name?: { value?: string } }> } }
    const def = args?.document?.definitions?.[0]
    return {
      type: def?.operation ?? 'query',
      name: def?.name?.value ?? '',
    }
  } catch {
    return { type: 'query', name: '' }
  }
}
