import { type DeepPartial, type FluxoryConfig, createTracker } from '@fluxory/core'
import { initNode, getTransport, getLogTransport, getNodeConfig } from './config'
import { maybeStartDashboard } from './dashboard'
import { patchHttp } from './interceptors/http'
import { patchMongoDB } from './interceptors/mongodb'
import { patchRedis } from './interceptors/redis'
import { patchPg } from './interceptors/pg'
import { patchMySQL } from './interceptors/mysql'
import { patchPrisma } from './interceptors/prisma'
import { patchSequelize } from './interceptors/sequelize'
import { patchTypeORM } from './interceptors/typeorm'
import { patchGrpc } from './interceptors/grpc'
import { patchGraphQL } from './interceptors/graphql'
import { patchRabbitMQ } from './interceptors/rabbitmq'
import { patchKafka } from './interceptors/kafka'
import { patchStdout } from './interceptors/stdout'

export { expressMiddleware } from './interceptors/express'
export { withFluxoryMiddleware, withFluxoryAction, withFluxoryRoute } from './interceptors/nextjs'
export { initNode } from './config'

export const fluxory = createTracker(
  () => getTransport(),
  () => getLogTransport(),
  () => {
    const cfg = getNodeConfig()
    return { serviceName: cfg?.serviceName ?? 'node-service', serviceType: cfg?.serviceType ?? 'server' }
  },
)
export type { FluxoryTracker, TrackerSpan, TraceOptions } from '@fluxory/core'

let initialized = false

export function init(opts?: DeepPartial<FluxoryConfig>): void {
  if (initialized) return
  initialized = true

  const config = initNode(opts)

  patchHttp()
  patchMongoDB()
  patchRedis()
  patchPg()
  patchMySQL()
  patchPrisma()
  patchSequelize()
  patchTypeORM()
  patchGrpc()
  patchGraphQL()
  patchRabbitMQ()
  patchKafka()
  patchStdout()

  maybeStartDashboard(config).catch(() => {})
}

init()
