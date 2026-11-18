export type SpanKind = 'client' | 'server' | 'internal' | 'producer' | 'consumer'
export type SpanStatus = 'ok' | 'error' | 'unset'
export type ServiceType = 'browser' | 'server' | 'database' | 'cache' | 'queue' | 'external'

export interface SpanEvent {
  name: string
  timestamp: number
  attributes?: Record<string, string | number | boolean>
}

export interface Span {
  traceId: string
  spanId: string
  parentSpanId?: string
  operationName: string
  serviceName: string
  serviceType: ServiceType
  kind: SpanKind
  startTime: number
  endTime?: number
  duration?: number
  status: SpanStatus
  statusMessage?: string
  attributes: Record<string, string | number | boolean>
  events: SpanEvent[]
}

export interface Trace {
  id: string
  rootSpan?: Span
  spans: Span[]
  startTime: number
  duration?: number
  services: string[]
  hasError: boolean
}

export interface TopologyNode {
  id: string
  serviceName: string
  serviceType: ServiceType
  requestCount: number
  errorCount: number
  avgLatency: number
  lastSeen: number
}

export interface TopologyEdge {
  id: string
  source: string
  target: string
  requestCount: number
  errorCount: number
  avgLatency: number
  lastSeen: number
}

export interface Topology {
  nodes: TopologyNode[]
  edges: TopologyEdge[]
}

export interface FluxoryConfig {
  serviceName: string
  serviceType: ServiceType
  collectorUrl: string
  apiKey: string
  dashboard: boolean
  batchSize: number
  flushInterval: number
  enabled: boolean
  debug: boolean
  sampleRate: number
  redactHeaders: string[]
}

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P]
}

export const DEFAULT_CONFIG: FluxoryConfig = {
  serviceName: 'unknown',
  serviceType: 'server',
  collectorUrl: 'http://localhost:4000',
  apiKey: '',
  dashboard: false,
  batchSize: 50,
  flushInterval: 2000,
  enabled: true,
  debug: false,
  sampleRate: 1.0,
  redactHeaders: ['authorization', 'cookie', 'set-cookie', 'x-api-key'],
}

export interface WSMessage {
  type: 'span' | 'topology' | 'stats' | 'connected' | 'log' | 'settings'
  data: unknown
}

export interface DashboardStats {
  totalTraces: number
  totalSpans: number
  activeServices: number
  errorRate: number
  avgLatency: number
  spansPerSecond: number
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogEntry {
  timestamp: number
  level: LogLevel
  message: string
  serviceName: string
  serviceType: ServiceType
  traceId?: string
  spanId?: string
  attributes?: Record<string, string | number | boolean>
}

export interface FluxorySettings {
  retentionMinutes: number
  maxTraces: number
  maxLogs: number
  sampleRate: number
}
