import { startSpan, endSpan, getContext, formatTraceparent, createSpanFromTraceparent } from '@fluxory/core'
import { getTransport, getNodeConfig } from '../config'

let patched = false

export function patchRabbitMQ(): void {
  if (patched) return
  patched = true

  try {
    const amqplib = require('amqplib')

    const originalConnect = amqplib.connect
    if (typeof originalConnect === 'function') {
      amqplib.connect = async function patchedConnect(...args: unknown[]) {
        const conn = await originalConnect.apply(this, args)
        const originalCreateChannel = conn.createChannel.bind(conn)
        const originalCreateConfirmChannel = conn.createConfirmChannel?.bind(conn)

        conn.createChannel = async function () {
          const channel = await originalCreateChannel()
          patchChannel(channel)
          return channel
        }

        if (originalCreateConfirmChannel) {
          conn.createConfirmChannel = async function () {
            const channel = await originalCreateConfirmChannel()
            patchChannel(channel)
            return channel
          }
        }

        return conn
      }
    }
  } catch {}
}

function patchChannel(channel: { publish?: Function; sendToQueue?: Function; consume?: Function }): void {
  if (typeof channel.publish === 'function') {
    const originalPublish = channel.publish
    channel.publish = function patchedPublish(
      exchange: string, routingKey: string, content: Buffer,
      options?: { headers?: Record<string, string> },
      ...rest: unknown[]
    ) {
      const config = getNodeConfig()
      if (!config?.enabled) return originalPublish.call(this, exchange, routingKey, content, options, ...rest)

      const span = startSpan({
        operationName: `rabbitmq.publish:${exchange || 'default'}`,
        kind: 'producer',
        serviceType: 'queue',
        serviceName: 'rabbitmq',
        parentContext: getContext(),
        attributes: {
          'messaging.system': 'rabbitmq',
          'messaging.operation': 'publish',
          'messaging.destination': exchange || 'default',
          'messaging.routing_key': routingKey,
        },
      })

      const headers = { ...options?.headers, traceparent: formatTraceparent(span.traceId, span.spanId) }
      const enrichedOptions = { ...options, headers }

      try {
        const result = originalPublish.call(this, exchange, routingKey, content, enrichedOptions, ...rest)
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

  if (typeof channel.sendToQueue === 'function') {
    const originalSendToQueue = channel.sendToQueue
    channel.sendToQueue = function patchedSendToQueue(
      queue: string, content: Buffer,
      options?: { headers?: Record<string, string> },
      ...rest: unknown[]
    ) {
      const config = getNodeConfig()
      if (!config?.enabled) return originalSendToQueue.call(this, queue, content, options, ...rest)

      const span = startSpan({
        operationName: `rabbitmq.send:${queue}`,
        kind: 'producer',
        serviceType: 'queue',
        serviceName: 'rabbitmq',
        parentContext: getContext(),
        attributes: {
          'messaging.system': 'rabbitmq',
          'messaging.operation': 'send',
          'messaging.destination': queue,
        },
      })

      const headers = { ...options?.headers, traceparent: formatTraceparent(span.traceId, span.spanId) }
      const enrichedOptions = { ...options, headers }

      try {
        const result = originalSendToQueue.call(this, queue, content, enrichedOptions, ...rest)
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

  if (typeof channel.consume === 'function') {
    const originalConsume = channel.consume
    channel.consume = function patchedConsume(
      queue: string,
      handler: (msg: { properties?: { headers?: Record<string, string> }; content?: Buffer } | null) => void,
      ...rest: unknown[]
    ) {
      const wrappedHandler = (msg: { properties?: { headers?: Record<string, string> }; content?: Buffer } | null) => {
        const config = getNodeConfig()
        if (!config?.enabled || !msg) return handler(msg)

        const traceparent = msg.properties?.headers?.traceparent
        const ctx = createSpanFromTraceparent(traceparent ?? null)

        const span = startSpan({
          operationName: `rabbitmq.consume:${queue}`,
          kind: 'consumer',
          serviceType: 'queue',
          serviceName: 'rabbitmq',
          parentContext: ctx.parentSpanId ? ctx : getContext(),
          attributes: {
            'messaging.system': 'rabbitmq',
            'messaging.operation': 'consume',
            'messaging.destination': queue,
          },
        })

        try {
          handler(msg)
          endSpan(span, 'ok')
        } catch (err) {
          endSpan(span, 'error', err instanceof Error ? err.message : String(err))
          throw err
        } finally {
          getTransport()?.add(span)
        }
      }

      return originalConsume.call(this, queue, wrappedHandler, ...rest)
    }
  }
}
