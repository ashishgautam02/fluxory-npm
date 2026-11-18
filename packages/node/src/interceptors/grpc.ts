import { startSpan, endSpan, getContext, formatTraceparent } from '@fluxory/core'
import { getTransport, getNodeConfig } from '../config'

let patched = false

export function patchGrpc(): void {
  if (patched) return
  patched = true

  try {
    const grpc = require('@grpc/grpc-js')
    patchGrpcClient(grpc)
    patchGrpcServer(grpc)
  } catch {}
}

function patchGrpcClient(grpc: { Client?: { prototype: Record<string, unknown> }; Metadata?: new () => { set: Function; get: Function } }): void {
  if (!grpc.Client?.prototype) return

  const originalMakeUnaryRequest = grpc.Client.prototype['makeUnaryRequest'] as Function
  if (typeof originalMakeUnaryRequest !== 'function') return

  grpc.Client.prototype['makeUnaryRequest'] = function patchedMakeUnaryRequest(
    this: unknown,
    method: string,
    serialize: Function,
    deserialize: Function,
    argument: unknown,
    metadata: { set?: Function },
    options: unknown,
    callback: Function,
  ) {
    const config = getNodeConfig()
    if (!config?.enabled) {
      return originalMakeUnaryRequest.call(this, method, serialize, deserialize, argument, metadata, options, callback)
    }

    const span = startSpan({
      operationName: `grpc.${extractMethod(method)}`,
      kind: 'client',
      serviceType: 'external',
      serviceName: extractService(method),
      parentContext: getContext(),
      attributes: {
        'rpc.system': 'grpc',
        'rpc.method': extractMethod(method),
        'rpc.service': extractService(method),
      },
    })

    if (metadata && typeof metadata.set === 'function') {
      metadata.set('traceparent', formatTraceparent(span.traceId, span.spanId))
    }

    const wrappedCallback = (err: Error | null, ...rest: unknown[]) => {
      if (err) {
        endSpan(span, 'error', err.message)
      } else {
        endSpan(span, 'ok')
      }
      getTransport()?.add(span)
      if (typeof callback === 'function') callback(err, ...rest)
    }

    return originalMakeUnaryRequest.call(this, method, serialize, deserialize, argument, metadata, options, wrappedCallback)
  }
}

function patchGrpcServer(grpc: { Server?: { prototype: { register?: Function } } }): void {
  if (!grpc.Server?.prototype?.register) return

  const originalRegister = grpc.Server.prototype.register
  grpc.Server.prototype.register = function patchedRegister(
    this: unknown,
    name: string,
    handler: Function,
    serialize: unknown,
    deserialize: unknown,
    type: string,
  ) {
    const wrappedHandler = function (call: { metadata?: { get?: Function }; request?: unknown }, callback: Function) {
      const config = getNodeConfig()
      if (!config?.enabled) return handler(call, callback)

      const span = startSpan({
        operationName: `grpc.${extractMethod(name)}`,
        kind: 'server',
        serviceType: 'server',
        parentContext: getContext(),
        attributes: {
          'rpc.system': 'grpc',
          'rpc.method': extractMethod(name),
          'rpc.service': extractService(name),
        },
      })

      const wrappedCallback = (err: Error | null, ...rest: unknown[]) => {
        if (err) endSpan(span, 'error', err.message)
        else endSpan(span, 'ok')
        getTransport()?.add(span)
        callback(err, ...rest)
      }

      return handler(call, wrappedCallback)
    }

    return originalRegister.call(this, name, wrappedHandler, serialize, deserialize, type)
  }
}

function extractService(fullMethod: string): string {
  const parts = fullMethod.replace(/^\//, '').split('/')
  return parts.length > 1 ? `grpc:${parts[0]}` : 'grpc'
}

function extractMethod(fullMethod: string): string {
  const parts = fullMethod.replace(/^\//, '').split('/')
  return parts[parts.length - 1] ?? fullMethod
}
