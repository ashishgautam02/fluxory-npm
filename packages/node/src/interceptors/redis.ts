import { startSpan, endSpan, getContext } from '@fluxory/core'
import { getTransport, getNodeConfig } from '../config'

let patched = false

export function patchRedis(): void {
  if (patched) return
  patched = true

  tryPatchIoredis()
  tryPatchNodeRedis()
}

function tryPatchIoredis(): void {
  try {
    const Redis = require('ioredis')
    if (!Redis?.prototype) return

    const originalSendCommand = Redis.prototype.sendCommand
    if (typeof originalSendCommand !== 'function') return

    Redis.prototype.sendCommand = function patchedSendCommand(this: unknown, command: { name: string; resolve?: Function; reject?: Function; promise?: Promise<unknown> }, ...args: unknown[]) {
      const config = getNodeConfig()
      if (!config?.enabled) return originalSendCommand.call(this, command, ...args)

      const span = startSpan({
        operationName: `redis.${command.name}`,
        kind: 'client',
        serviceType: 'cache',
        serviceName: 'redis',
        parentContext: getContext(),
        attributes: {
          'db.system': 'redis',
          'db.operation': command.name,
        },
      })

      const result = originalSendCommand.call(this, command, ...args)

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
  } catch {
    // ioredis not installed
  }
}

function tryPatchNodeRedis(): void {
  try {
    const redis = require('redis')
    const originalCreateClient = redis.createClient
    if (typeof originalCreateClient !== 'function') return

    redis.createClient = function patchedCreateClient(this: unknown, ...args: unknown[]) {
      const client = originalCreateClient.apply(this, args)

      const commandsToWrap = [
        'get', 'set', 'del', 'hGet', 'hSet', 'hDel', 'hGetAll',
        'lPush', 'rPush', 'lPop', 'rPop', 'lRange',
        'sAdd', 'sRem', 'sMembers', 'expire', 'ttl', 'exists', 'keys',
      ]

      for (const cmd of commandsToWrap) {
        const original = client[cmd]
        if (typeof original !== 'function') continue

        client[cmd] = function wrappedCommand(this: unknown, ...cmdArgs: unknown[]) {
          const config = getNodeConfig()
          if (!config?.enabled) return original.apply(this, cmdArgs)

          const span = startSpan({
            operationName: `redis.${cmd}`,
            kind: 'client',
            serviceType: 'cache',
            serviceName: 'redis',
            parentContext: getContext(),
            attributes: {
              'db.system': 'redis',
              'db.operation': cmd,
            },
          })

          const result = original.apply(this, cmdArgs)
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

      return client
    }
  } catch {
    // redis not installed
  }
}
