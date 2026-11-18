import { startSpan, endSpan, getContext, formatTraceparent, createSpanFromTraceparent, setContext } from '@fluxory/core'
import { getTransport, getNodeConfig } from '../config'

let patched = false

export function patchKafka(): void {
  if (patched) return
  patched = true

  try {
    const { Kafka } = require('kafkajs')
    if (!Kafka?.prototype) return

    const originalProducer = Kafka.prototype.producer
    Kafka.prototype.producer = function patchedProducer(this: unknown, ...args: unknown[]) {
      const producer = originalProducer.apply(this, args)
      patchProducer(producer)
      return producer
    }

    const originalConsumer = Kafka.prototype.consumer
    Kafka.prototype.consumer = function patchedConsumer(this: unknown, ...args: unknown[]) {
      const consumer = originalConsumer.apply(this, args)
      patchConsumer(consumer)
      return consumer
    }
  } catch {}
}

function patchProducer(producer: { send?: Function; sendBatch?: Function }): void {
  if (typeof producer.send === 'function') {
    const originalSend = producer.send
    producer.send = async function patchedSend(payload: {
      topic: string
      messages: Array<{ headers?: Record<string, string | Buffer>; key?: string; value: unknown }>
    }) {
      const config = getNodeConfig()
      if (!config?.enabled) return originalSend.call(this, payload)

      const span = startSpan({
        operationName: `kafka.produce:${payload.topic}`,
        kind: 'producer',
        serviceType: 'queue',
        serviceName: 'kafka',
        parentContext: getContext(),
        attributes: {
          'messaging.system': 'kafka',
          'messaging.operation': 'produce',
          'messaging.destination': payload.topic,
          'messaging.batch_size': payload.messages.length,
        },
      })

      for (const msg of payload.messages) {
        if (!msg.headers) msg.headers = {}
        msg.headers['traceparent'] = formatTraceparent(span.traceId, span.spanId)
      }

      try {
        const result = await originalSend.call(this, payload)
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

  if (typeof producer.sendBatch === 'function') {
    const originalSendBatch = producer.sendBatch
    producer.sendBatch = async function patchedSendBatch(batch: {
      topicMessages: Array<{
        topic: string
        messages: Array<{ headers?: Record<string, string | Buffer> }>
      }>
    }) {
      const config = getNodeConfig()
      if (!config?.enabled) return originalSendBatch.call(this, batch)

      const topics = batch.topicMessages.map(t => t.topic).join(',')
      const span = startSpan({
        operationName: `kafka.produceBatch:${topics}`,
        kind: 'producer',
        serviceType: 'queue',
        serviceName: 'kafka',
        parentContext: getContext(),
        attributes: {
          'messaging.system': 'kafka',
          'messaging.operation': 'produceBatch',
          'messaging.destination': topics,
        },
      })

      for (const tm of batch.topicMessages) {
        for (const msg of tm.messages) {
          if (!msg.headers) msg.headers = {}
          msg.headers['traceparent'] = formatTraceparent(span.traceId, span.spanId)
        }
      }

      try {
        const result = await originalSendBatch.call(this, batch)
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

function patchConsumer(consumer: { run?: Function }): void {
  if (typeof consumer.run !== 'function') return

  const originalRun = consumer.run
  consumer.run = function patchedRun(config: {
    eachMessage?: (payload: {
      topic: string
      partition: number
      message: { headers?: Record<string, Buffer | string>; key?: Buffer; value: Buffer }
    }) => Promise<void>
    eachBatch?: Function
  }) {
    if (typeof config.eachMessage === 'function') {
      const originalEachMessage = config.eachMessage
      config.eachMessage = async (payload) => {
        const nodeConfig = getNodeConfig()
        if (!nodeConfig?.enabled) return originalEachMessage(payload)

        const traceparent = payload.message.headers?.traceparent
        const traceparentStr = traceparent ? (Buffer.isBuffer(traceparent) ? traceparent.toString() : traceparent) : null
        const ctx = createSpanFromTraceparent(traceparentStr)

        const span = startSpan({
          operationName: `kafka.consume:${payload.topic}`,
          kind: 'consumer',
          serviceType: 'queue',
          serviceName: 'kafka',
          parentContext: ctx.parentSpanId ? ctx : getContext(),
          attributes: {
            'messaging.system': 'kafka',
            'messaging.operation': 'consume',
            'messaging.destination': payload.topic,
            'messaging.partition': payload.partition,
          },
        })

        setContext({ traceId: span.traceId, spanId: span.spanId })

        try {
          await originalEachMessage(payload)
          endSpan(span, 'ok')
        } catch (err) {
          endSpan(span, 'error', err instanceof Error ? err.message : String(err))
          throw err
        } finally {
          getTransport()?.add(span)
        }
      }
    }

    return originalRun.call(this, config)
  }
}
