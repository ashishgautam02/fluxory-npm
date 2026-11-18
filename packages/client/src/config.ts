import { type FluxoryConfig, type DeepPartial, DEFAULT_CONFIG, SpanTransport, setConfig, setApiKey } from '@fluxory/core'

let transport: SpanTransport | null = null
let clientConfig: FluxoryConfig | null = null

export function initClient(opts?: DeepPartial<FluxoryConfig>): FluxoryConfig {
  const config: FluxoryConfig = {
    ...DEFAULT_CONFIG,
    serviceName: opts?.serviceName ?? detectAppName(),
    serviceType: 'browser',
    collectorUrl: opts?.collectorUrl ?? DEFAULT_CONFIG.collectorUrl,
    apiKey: opts?.apiKey ?? '',
    batchSize: opts?.batchSize ?? 20,
    flushInterval: opts?.flushInterval ?? 3000,
    enabled: opts?.enabled ?? true,
    debug: opts?.debug ?? false,
    sampleRate: opts?.sampleRate ?? DEFAULT_CONFIG.sampleRate,
    redactHeaders: (opts?.redactHeaders as string[] | undefined) ?? DEFAULT_CONFIG.redactHeaders,
  }

  clientConfig = config
  setConfig(config)
  if (config.apiKey) setApiKey(config.apiKey)
  transport = new SpanTransport(config)

  if (config.debug) {
    console.log(`[fluxory] client initialized: ${config.serviceName} → ${config.collectorUrl}`)
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => transport?.flush())
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') transport?.flush()
    })
  }

  return config
}

export function getTransport(): SpanTransport | null {
  return transport
}

export function getClientConfig(): FluxoryConfig | null {
  return clientConfig
}

function detectAppName(): string {
  if (typeof document !== 'undefined' && document.title) {
    return document.title.slice(0, 40).toLowerCase().replace(/\s+/g, '-') || 'web-app'
  }
  return 'web-app'
}
