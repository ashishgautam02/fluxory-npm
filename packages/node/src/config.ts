import { type FluxoryConfig, type DeepPartial, DEFAULT_CONFIG, SpanTransport, LogTransport, setConfig, setApiKey } from '@fluxory/core'

let transport: SpanTransport | null = null
let logTransport: LogTransport | null = null
let nodeConfig: FluxoryConfig | null = null

export function initNode(opts?: DeepPartial<FluxoryConfig>): FluxoryConfig {
  const config: FluxoryConfig = {
    ...DEFAULT_CONFIG,
    serviceName: opts?.serviceName ?? process.env.FLUXORY_SERVICE_NAME ?? detectServiceName(),
    serviceType: opts?.serviceType ?? 'server',
    collectorUrl: opts?.collectorUrl ?? process.env.FLUXORY_COLLECTOR_URL ?? DEFAULT_CONFIG.collectorUrl,
    apiKey: opts?.apiKey ?? process.env.FLUXORY_API_KEY ?? '',
    dashboard: opts?.dashboard ?? process.env.FLUXORY_DASHBOARD === 'true',
    batchSize: opts?.batchSize ?? DEFAULT_CONFIG.batchSize,
    flushInterval: opts?.flushInterval ?? DEFAULT_CONFIG.flushInterval,
    enabled: opts?.enabled ?? process.env.FLUXORY_ENABLED !== 'false',
    debug: opts?.debug ?? process.env.FLUXORY_DEBUG === 'true',
    sampleRate: opts?.sampleRate ?? DEFAULT_CONFIG.sampleRate,
    redactHeaders: (opts?.redactHeaders as string[] | undefined) ?? DEFAULT_CONFIG.redactHeaders,
  }

  nodeConfig = config
  setConfig(config)
  if (config.apiKey) setApiKey(config.apiKey)
  transport = new SpanTransport(config)
  logTransport = new LogTransport(config)

  if (config.debug) {
    console.log(`[fluxory] initialized: ${config.serviceName} → ${config.collectorUrl}`)
  }

  process.on('beforeExit', () => { transport?.destroy(); logTransport?.destroy() })
  process.on('SIGTERM', () => { transport?.destroy(); logTransport?.destroy(); process.exit(0) })
  process.on('SIGINT', () => { transport?.destroy(); logTransport?.destroy(); process.exit(0) })

  return config
}

export function getTransport(): SpanTransport | null {
  return transport
}

export function getLogTransport(): LogTransport | null {
  return logTransport
}

export function getNodeConfig(): FluxoryConfig | null {
  return nodeConfig
}

function detectServiceName(): string {
  try {
    const pkg = require(require('path').resolve(process.cwd(), 'package.json'))
    return pkg.name ?? 'node-service'
  } catch {
    return 'node-service'
  }
}
