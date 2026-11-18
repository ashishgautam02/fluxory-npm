import type { Span, Trace, Topology, TopologyNode, TopologyEdge, DashboardStats, LogEntry, FluxorySettings } from '@fluxory/core'
import type { Persistence } from './persistence'

const DEFAULT_SETTINGS: FluxorySettings = {
  retentionMinutes: 1440,
  maxTraces: 10_000,
  maxLogs: 50_000,
  sampleRate: 1.0,
}

const STATS_WINDOW_MS = 60_000

export class SpanStore {
  private traces = new Map<string, Trace>()
  private traceOrder: string[] = []
  private topologyNodes = new Map<string, TopologyNode>()
  private topologyEdges = new Map<string, TopologyEdge>()
  private recentSpanTimestamps: number[] = []
  private logs: LogEntry[] = []
  private settings: FluxorySettings = { ...DEFAULT_SETTINGS }
  private retentionTimer: ReturnType<typeof setInterval> | null = null
  private persistence: Persistence | null = null

  constructor(persistence?: Persistence) {
    this.persistence = persistence ?? null
    this.retentionTimer = setInterval(() => this.applyRetention(), 30_000)
  }

  async restore(): Promise<void> {
    if (!this.persistence) return
    await this.persistence.ready

    const savedSettings = this.persistence.loadSettings()
    if (savedSettings) this.settings = savedSettings

    const spans = this.persistence.loadSpans()
    for (const span of spans) this.addSpan(span, true)

    const logs = this.persistence.loadLogs()
    for (const log of logs) this.addLog(log, true)
  }

  addSpan(span: Span, fromDb = false): void {
    if (!fromDb) this.persistence?.saveSpan(span)
    let trace = this.traces.get(span.traceId)
    if (!trace) {
      trace = {
        id: span.traceId,
        spans: [],
        startTime: span.startTime,
        services: [],
        hasError: false,
      }
      this.traces.set(span.traceId, trace)
      this.traceOrder.push(span.traceId)
      this.evict()
    }

    trace.spans.push(span)
    if (span.status === 'error') trace.hasError = true
    if (!trace.services.includes(span.serviceName)) {
      trace.services.push(span.serviceName)
    }

    if (!span.parentSpanId) {
      trace.rootSpan = span
    }

    if (span.duration != null) {
      const end = span.startTime + span.duration
      trace.duration = Math.max(trace.duration ?? 0, end - trace.startTime)
    }

    this.updateTopology(span)
    this.recentSpanTimestamps.push(Date.now())
  }

  private updateTopology(span: Span): void {
    const nodeId = span.serviceName
    const existing = this.topologyNodes.get(nodeId)

    if (existing) {
      existing.requestCount++
      if (span.status === 'error') existing.errorCount++
      if (span.duration != null) {
        existing.avgLatency = existing.avgLatency + (span.duration - existing.avgLatency) / existing.requestCount
      }
      existing.lastSeen = Date.now()
    } else {
      this.topologyNodes.set(nodeId, {
        id: nodeId,
        serviceName: span.serviceName,
        serviceType: span.serviceType,
        requestCount: 1,
        errorCount: span.status === 'error' ? 1 : 0,
        avgLatency: span.duration ?? 0,
        lastSeen: Date.now(),
      })
    }

    if (span.parentSpanId) {
      const parentSpan = this.findSpan(span.traceId, span.parentSpanId)
      if (parentSpan && parentSpan.serviceName !== span.serviceName) {
        const edgeId = `${parentSpan.serviceName}→${span.serviceName}`
        const edge = this.topologyEdges.get(edgeId)

        if (edge) {
          edge.requestCount++
          if (span.status === 'error') edge.errorCount++
          if (span.duration != null) {
            edge.avgLatency = edge.avgLatency + (span.duration - edge.avgLatency) / edge.requestCount
          }
          edge.lastSeen = Date.now()
        } else {
          this.topologyEdges.set(edgeId, {
            id: edgeId,
            source: parentSpan.serviceName,
            target: span.serviceName,
            requestCount: 1,
            errorCount: span.status === 'error' ? 1 : 0,
            avgLatency: span.duration ?? 0,
            lastSeen: Date.now(),
          })
        }
      }
    }
  }

  private findSpan(traceId: string, spanId: string): Span | undefined {
    const trace = this.traces.get(traceId)
    return trace?.spans.find(s => s.spanId === spanId)
  }

  private evict(): void {
    while (this.traceOrder.length > this.settings.maxTraces) {
      const oldest = this.traceOrder.shift()!
      this.traces.delete(oldest)
    }
  }

  addLog(log: LogEntry, fromDb = false): void {
    if (!fromDb) this.persistence?.saveLog(log)
    this.logs.push(log)
    while (this.logs.length > this.settings.maxLogs) {
      this.logs.shift()
    }
  }

  getLogs(opts?: { service?: string; level?: string; limit?: number; search?: string }): LogEntry[] {
    let result = this.logs
    if (opts?.service) {
      result = result.filter(l => l.serviceName === opts.service)
    }
    if (opts?.level) {
      result = result.filter(l => l.level === opts.level)
    }
    if (opts?.search) {
      const q = opts.search.toLowerCase()
      result = result.filter(l => l.message.toLowerCase().includes(q))
    }
    const limit = opts?.limit ?? 200
    return result.slice(-limit).reverse()
  }

  getSettings(): FluxorySettings {
    return { ...this.settings }
  }

  updateSettings(patch: Partial<FluxorySettings>): FluxorySettings {
    if (patch.retentionMinutes != null) this.settings.retentionMinutes = Math.max(1, patch.retentionMinutes)
    if (patch.maxTraces != null) this.settings.maxTraces = Math.max(100, patch.maxTraces)
    if (patch.maxLogs != null) this.settings.maxLogs = Math.max(100, patch.maxLogs)
    if (patch.sampleRate != null) this.settings.sampleRate = Math.max(0, Math.min(1, patch.sampleRate))
    this.persistence?.saveSettings(this.settings)
    return this.getSettings()
  }

  private applyRetention(): void {
    const cutoff = Date.now() - this.settings.retentionMinutes * 60_000
    while (this.traceOrder.length > 0) {
      const oldest = this.traces.get(this.traceOrder[0])
      if (!oldest || oldest.startTime < cutoff) {
        const id = this.traceOrder.shift()!
        this.traces.delete(id)
      } else {
        break
      }
    }
    const logCutIdx = this.logs.findIndex(l => l.timestamp >= cutoff)
    if (logCutIdx > 0) this.logs.splice(0, logCutIdx)
    else if (logCutIdx === -1 && this.logs.length > 0 && this.logs[0].timestamp < cutoff) this.logs = []

    this.persistence?.applyRetention(cutoff, this.settings.maxLogs)
  }

  getTraces(limit = 50, offset = 0): Trace[] {
    const ids = this.traceOrder.slice().reverse().slice(offset, offset + limit)
    return ids.map(id => this.traces.get(id)!).filter(Boolean)
  }

  getTrace(traceId: string): Trace | undefined {
    return this.traces.get(traceId)
  }

  getTopology(): Topology {
    return {
      nodes: Array.from(this.topologyNodes.values()),
      edges: Array.from(this.topologyEdges.values()),
    }
  }

  getStats(): DashboardStats {
    const now = Date.now()
    this.recentSpanTimestamps = this.recentSpanTimestamps.filter(t => now - t < STATS_WINDOW_MS)

    let totalLatency = 0
    let latencyCount = 0
    let errorCount = 0
    let totalSpans = 0

    for (const trace of this.traces.values()) {
      totalSpans += trace.spans.length
      for (const span of trace.spans) {
        if (span.duration != null) {
          totalLatency += span.duration
          latencyCount++
        }
        if (span.status === 'error') errorCount++
      }
    }

    return {
      totalTraces: this.traces.size,
      totalSpans,
      activeServices: this.topologyNodes.size,
      errorRate: totalSpans > 0 ? (errorCount / totalSpans) * 100 : 0,
      avgLatency: latencyCount > 0 ? totalLatency / latencyCount : 0,
      spansPerSecond: this.recentSpanTimestamps.length / (STATS_WINDOW_MS / 1000),
    }
  }

  clear(): void {
    this.traces.clear()
    this.traceOrder = []
    this.topologyNodes.clear()
    this.topologyEdges.clear()
    this.recentSpanTimestamps = []
    this.logs = []
    this.persistence?.clear()
  }

  destroy(): void {
    if (this.retentionTimer) {
      clearInterval(this.retentionTimer)
      this.retentionTimer = null
    }
    this.persistence?.destroy()
  }

  getServiceNames(): string[] {
    return Array.from(this.topologyNodes.keys())
  }
}
