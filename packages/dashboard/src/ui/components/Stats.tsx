import React from 'react'
import type { DashboardStats } from '@fluxory/core'

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toFixed(0)
}

function formatLatency(ms: number): string {
  if (ms < 1) return '<1ms'
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

interface StatsProps {
  stats: DashboardStats
  connected: boolean
}

export default function Stats({ stats, connected }: StatsProps) {
  return (
    <div className="stats-bar">
      <div className="stat">
        <span className="stat-value">{formatNumber(stats.totalTraces)}</span>
        <span className="stat-label">Traces</span>
      </div>
      <div className="stat">
        <span className="stat-value">{stats.activeServices}</span>
        <span className="stat-label">Services</span>
      </div>
      <div className="stat">
        <span className="stat-value" style={{ color: stats.errorRate > 5 ? 'var(--error)' : stats.errorRate > 1 ? 'var(--warning)' : 'var(--text-primary)' }}>
          {stats.errorRate.toFixed(1)}%
        </span>
        <span className="stat-label">Errors</span>
      </div>
      <div className="stat">
        <span className="stat-value">{formatLatency(stats.avgLatency)}</span>
        <span className="stat-label">Avg Latency</span>
      </div>
      <div className="stat">
        <span className="stat-value" style={{ color: stats.spansPerSecond > 0 ? 'var(--text-primary)' : 'var(--text-muted)' }}>
          {stats.spansPerSecond.toFixed(1)}
        </span>
        <span className="stat-label">Spans/s</span>
      </div>
    </div>
  )
}
