import type { Span, LogEntry } from '@fluxory/core'
import type { SpanStore } from './store'
import type { WsBroadcaster } from './ws'

export class Collector {
  private store: SpanStore
  private broadcaster: WsBroadcaster
  private statsTimer: ReturnType<typeof setInterval> | null = null

  constructor(store: SpanStore, broadcaster: WsBroadcaster) {
    this.store = store
    this.broadcaster = broadcaster

    this.statsTimer = setInterval(() => {
      this.broadcaster.broadcastStats()
    }, 2000)
  }

  ingest(spans: Span[]): void {
    for (const span of spans) {
      this.store.addSpan(span)
      this.broadcaster.broadcastSpan(span)
    }
    this.broadcaster.broadcastTopology()
    this.broadcaster.broadcastStats()
  }

  ingestLogs(logs: LogEntry[]): void {
    for (const log of logs) {
      this.store.addLog(log)
      this.broadcaster.broadcastLog(log)
    }
  }

  destroy(): void {
    if (this.statsTimer) {
      clearInterval(this.statsTimer)
      this.statsTimer = null
    }
  }
}
