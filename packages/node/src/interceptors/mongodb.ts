import { startSpan, endSpan, getContext } from '@fluxory/core'
import { getTransport, getNodeConfig } from '../config'

let patched = false

export function patchMongoDB(): void {
  if (patched) return
  patched = true

  try {
    const mongodb = require('mongodb')
    const Collection = mongodb.Collection

    if (!Collection?.prototype) return

    const ops = [
      'insertOne', 'insertMany', 'findOne', 'find',
      'updateOne', 'updateMany', 'deleteOne', 'deleteMany',
      'aggregate', 'countDocuments', 'distinct',
    ] as const

    for (const op of ops) {
      const original = Collection.prototype[op]
      if (typeof original !== 'function') continue

      Collection.prototype[op] = function patchedOp(this: { collectionName: string; dbName?: string; s?: { namespace?: { db?: string } } }, ...args: unknown[]) {
        const config = getNodeConfig()
        if (!config?.enabled) return original.apply(this, args)

        const collection = this.collectionName ?? 'unknown'
        const db = this.s?.namespace?.db ?? this.dbName ?? 'unknown'

        const span = startSpan({
          operationName: `mongodb.${op}`,
          kind: 'client',
          serviceType: 'database',
          serviceName: `mongodb:${db}`,
          parentContext: getContext(),
          attributes: {
            'db.system': 'mongodb',
            'db.name': db,
            'db.collection': collection,
            'db.operation': op,
          },
        })

        const result = original.apply(this, args)

        if (result && typeof result.then === 'function') {
          return result.then(
            (val: unknown) => { endSpan(span, 'ok'); getTransport()?.add(span); return val },
            (err: Error) => { endSpan(span, 'error', err.message); getTransport()?.add(span); throw err },
          )
        }

        if (result && typeof result.toArray === 'function') {
          const originalToArray = result.toArray.bind(result)
          result.toArray = function patchedToArray(...toArrayArgs: unknown[]) {
            const toArrayResult = originalToArray(...toArrayArgs)
            if (toArrayResult && typeof toArrayResult.then === 'function') {
              return toArrayResult.then(
                (val: unknown) => { endSpan(span, 'ok'); getTransport()?.add(span); return val },
                (err: Error) => { endSpan(span, 'error', err.message); getTransport()?.add(span); throw err },
              )
            }
            endSpan(span, 'ok')
            getTransport()?.add(span)
            return toArrayResult
          }
          return result
        }

        endSpan(span, 'ok')
        getTransport()?.add(span)
        return result
      }
    }
  } catch {
    // mongodb not installed
  }
}
