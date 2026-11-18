import React, { useState, useMemo } from 'react'
import type { Trace } from '@fluxory/core'
import { shortId } from '@fluxory/core'

function formatDuration(ms?: number): string {
  if (ms == null) return '--'
  if (ms < 1) return '<1ms'
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

function timeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp
  if (diff < 1000) return 'just now'
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  return `${Math.floor(diff / 3_600_000)}h ago`
}

type StatusFilter = 'all' | 'error' | 'ok'

interface TraceListProps {
  traces: Trace[]
  selectedTraceId?: string
  onSelect: (trace: Trace) => void
}

export default function TraceList({ traces, selectedTraceId, onSelect }: TraceListProps) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

  const filtered = useMemo(() => {
    let result = traces
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(t => {
        const rootOp = t.rootSpan?.operationName ?? t.spans[0]?.operationName ?? ''
        return rootOp.toLowerCase().includes(q) || t.services.some(s => s.toLowerCase().includes(q))
      })
    }
    if (statusFilter === 'error') result = result.filter(t => t.hasError)
    if (statusFilter === 'ok') result = result.filter(t => !t.hasError)
    return result
  }, [traces, search, statusFilter])

  if (traces.length === 0) {
    return (
      <div className="empty-state" style={{ padding: '40px 20px' }}>
        <div className="empty-state-icon">📋</div>
        <h2>No traces yet</h2>
        <p>Traces will appear here as your app handles requests.</p>
      </div>
    )
  }

  return (
    <div>
      {/* Search + filter */}
      <div className="trace-toolbar">
        <input
          className="trace-search"
          type="text"
          placeholder="Filter traces..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div className="trace-filters">
          {(['all', 'error', 'ok'] as StatusFilter[]).map(f => (
            <button
              key={f}
              className={`filter-btn ${statusFilter === f ? 'active' : ''} ${f === 'error' ? 'error' : ''}`}
              onClick={() => setStatusFilter(f)}
            >
              {f === 'all' ? 'All' : f === 'error' ? 'Errors' : 'OK'}
              {f === 'error' && (
                <span className="filter-count">{traces.filter(t => t.hasError).length}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Results */}
      <div className="trace-results">
        {filtered.length === 0 ? (
          <div className="text-muted" style={{ textAlign: 'center', padding: 20, fontSize: 13 }}>
            No matching traces
          </div>
        ) : (
          filtered.map(trace => {
            const rootOp = trace.rootSpan?.operationName ?? trace.spans[0]?.operationName ?? 'unknown'
            const isActive = trace.id === selectedTraceId

            return (
              <div
                key={trace.id}
                className={`trace-item ${isActive ? 'active' : ''}`}
                onClick={() => onSelect(trace)}
                style={{ animation: 'fadeIn 0.2s ease' }}
              >
                <div className="trace-item-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div className={`status-dot ${trace.hasError ? 'error' : 'ok'}`} />
                    <span className="trace-operation">{rootOp}</span>
                  </div>
                  <span className="trace-duration">{formatDuration(trace.duration)}</span>
                </div>
                <div className="trace-meta">
                  <span className="trace-id">{shortId(trace.id)}</span>
                  <span className="text-muted" style={{ fontSize: 11 }}>{timeAgo(trace.startTime)}</span>
                  <div className="trace-services">
                    {trace.services.slice(0, 3).map(s => (
                      <span key={s} className="service-badge">{s}</span>
                    ))}
                    {trace.services.length > 3 && (
                      <span className="service-badge">+{trace.services.length - 3}</span>
                    )}
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
