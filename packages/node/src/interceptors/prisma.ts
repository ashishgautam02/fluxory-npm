import { startSpan, endSpan, getContext } from '@fluxory/core'
import { getTransport, getNodeConfig } from '../config'

let patched = false

export function patchPrisma(): void {
  if (patched) return
  patched = true

  try {
    const { PrismaClient } = require('@prisma/client')
    if (!PrismaClient?.prototype) return

    const originalConnect = PrismaClient.prototype.$connect
    PrismaClient.prototype.$connect = async function patchedConnect(this: {
      _fluxoryPatched?: boolean
      $use?: Function
      $on?: Function
    }, ...args: unknown[]) {
      if (!this._fluxoryPatched && typeof this.$use === 'function') {
        this._fluxoryPatched = true
        this.$use(createPrismaMiddleware())
      }
      return originalConnect.apply(this, args)
    }

    const OriginalConstructor = PrismaClient
    const patchedProto = Object.create(OriginalConstructor.prototype)
    const originalInit = patchedProto.constructor

    Object.defineProperty(PrismaClient.prototype, '_fluxoryAutoInit', {
      value: function () {
        if (!this._fluxoryPatched && typeof this.$use === 'function') {
          this._fluxoryPatched = true
          this.$use(createPrismaMiddleware())
        }
      },
      writable: false,
      enumerable: false,
    })

    const methods = ['$queryRaw', '$executeRaw', '$queryRawUnsafe', '$executeRawUnsafe'] as const
    for (const method of methods) {
      const original = PrismaClient.prototype[method]
      if (typeof original !== 'function') continue

      PrismaClient.prototype[method] = function patchedRaw(this: { _fluxoryPatched?: boolean; _fluxoryAutoInit?: Function }, ...rawArgs: unknown[]) {
        if (!this._fluxoryPatched) this._fluxoryAutoInit?.()

        const config = getNodeConfig()
        if (!config?.enabled) return original.apply(this, rawArgs)

        const span = startSpan({
          operationName: `prisma.${method}`,
          kind: 'client',
          serviceType: 'database',
          serviceName: 'prisma',
          parentContext: getContext(),
          attributes: {
            'db.system': 'prisma',
            'db.operation': method,
          },
        })

        const result = original.apply(this, rawArgs)
        if (result && typeof result.then === 'function') {
          return result.then(
            (val: unknown) => { endSpan(span, 'ok'); getTransport()?.add(span); return val },
            (err: Error) => { endSpan(span, 'error', err.message); getTransport()?.add(span); throw err },
          )
        }

        endSpan(span, 'ok')
        getTransport()?.add(span)
        return result
      }
    }
  } catch {}
}

function createPrismaMiddleware() {
  return async function fluxoryPrismaMiddleware(params: { model?: string; action: string; args: unknown }, next: Function) {
    const config = getNodeConfig()
    if (!config?.enabled) return next(params)

    const model = params.model ?? 'unknown'
    const action = params.action

    const span = startSpan({
      operationName: `prisma.${model}.${action}`,
      kind: 'client',
      serviceType: 'database',
      serviceName: 'prisma',
      parentContext: getContext(),
      attributes: {
        'db.system': 'prisma',
        'db.operation': action,
        'db.collection': model,
      },
    })

    try {
      const result = await next(params)
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
