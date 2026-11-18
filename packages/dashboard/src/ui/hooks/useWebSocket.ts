import { useState, useEffect, useRef, useCallback } from 'react'
import type { Span, Topology, DashboardStats, LogEntry, FluxorySettings, WSMessage } from '@fluxory/core'

interface WSState {
  connected: boolean
  spans: Span[]
  topology: Topology
  stats: DashboardStats
  recentSpans: Span[]
  logs: LogEntry[]
  settings: FluxorySettings
}

const EMPTY_TOPOLOGY: Topology = { nodes: [], edges: [] }
const EMPTY_STATS: DashboardStats = {
  totalTraces: 0, totalSpans: 0, activeServices: 0,
  errorRate: 0, avgLatency: 0, spansPerSecond: 0,
}
const DEFAULT_SETTINGS: FluxorySettings = {
  retentionMinutes: 1440, maxTraces: 10_000, maxLogs: 50_000, sampleRate: 1.0,
}
const MAX_RECENT_SPANS = 200
const MAX_RECENT_LOGS = 500

export function useWebSocket(url: string) {
  const [state, setState] = useState<WSState>({
    connected: false,
    spans: [],
    topology: EMPTY_TOPOLOGY,
    stats: EMPTY_STATS,
    recentSpans: [],
    logs: [],
    settings: DEFAULT_SETTINGS,
  })

  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>()

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      setState(s => ({ ...s, connected: true }))
    }

    ws.onmessage = (event) => {
      try {
        const msg: WSMessage = JSON.parse(event.data)

        switch (msg.type) {
          case 'span':
            setState(s => ({
              ...s,
              recentSpans: [msg.data as Span, ...s.recentSpans].slice(0, MAX_RECENT_SPANS),
            }))
            break
          case 'topology':
            setState(s => ({ ...s, topology: msg.data as Topology }))
            break
          case 'stats':
            setState(s => ({ ...s, stats: msg.data as DashboardStats }))
            break
          case 'log':
            setState(s => ({
              ...s,
              logs: [...s.logs, msg.data as LogEntry].slice(-MAX_RECENT_LOGS),
            }))
            break
          case 'settings':
            setState(s => ({ ...s, settings: msg.data as FluxorySettings }))
            break
        }
      } catch {}
    }

    ws.onclose = () => {
      setState(s => ({ ...s, connected: false }))
      reconnectTimer.current = setTimeout(connect, 2000)
    }

    ws.onerror = () => {
      ws.close()
    }
  }, [url])

  useEffect(() => {
    connect()

    const base = url.replace('ws://', 'http://').replace('wss://', 'https://').replace(/\/ws(\?.*)?$/, '')
    const token = sessionStorage.getItem('fluxory_token')
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {}
    fetch(`${base}/api/logs?limit=500`, { headers })
      .then(r => r.ok ? r.json() : [])
      .then((existing: LogEntry[]) => {
        if (existing.length) {
          setState(s => ({
            ...s,
            logs: [...existing.reverse(), ...s.logs].slice(-MAX_RECENT_LOGS),
          }))
        }
      })
      .catch(() => {})

    return () => {
      clearTimeout(reconnectTimer.current)
      wsRef.current?.close()
    }
  }, [connect])

  return state
}
