import React from 'react'
import type { Span } from '@fluxory/core'
import { shortId } from '@fluxory/core'

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-US', {
    hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3,
  })
}

function formatDuration(ms?: number): string {
  if (ms == null) return '--'
  if (ms < 1) return '<1ms'
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

interface SpanDetailProps {
  span: Span
  onClose: () => void
  allSpans?: Span[]
}

function getParentChain(span: Span, allSpans: Span[]): Span[] {
  const chain: Span[] = []
  let current = span
  while (current.parentSpanId) {
    const parent = allSpans.find(s => s.spanId === current.parentSpanId)
    if (!parent) break
    chain.unshift(parent)
    current = parent
  }
  return chain
}

const HTTP_ATTRS = ['http.method', 'http.url', 'http.status_code', 'http.host', 'http.path', 'http.route']
const DB_ATTRS = ['db.system', 'db.name', 'db.statement', 'db.operation', 'db.collection']

export default function SpanDetail({ span, onClose, allSpans = [] }: SpanDetailProps) {
  const parentChain = getParentChain(span, allSpans)
  const httpMethod = span.attributes['http.method'] as string | undefined
  const httpUrl = span.attributes['http.url'] as string | undefined
  const httpStatus = span.attributes['http.status_code'] as number | undefined
  const dbSystem = span.attributes['db.system'] as string | undefined

  const generalAttrs = Object.entries(span.attributes).filter(
    ([key]) => !HTTP_ATTRS.includes(key) && !DB_ATTRS.includes(key)
  )

  return (
    <div className="span-detail" style={{ animation: 'fadeIn 0.2s ease' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <h3 style={{ margin: 0 }}>{span.operationName}</h3>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            {span.serviceName} · {span.kind}
          </div>
        </div>
        <button onClick={onClose} className="close-btn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Status badge */}
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '4px 10px', borderRadius: 4, marginBottom: 16, fontSize: 12, fontWeight: 500,
        background: span.status === 'error' ? 'var(--error-glow)' : 'var(--success-glow)',
        color: span.status === 'error' ? 'var(--error)' : 'var(--success)',
      }}>
        <span className={`status-dot ${span.status === 'error' ? 'error' : 'ok'}`} />
        {span.status.toUpperCase()}
        {span.statusMessage && <span style={{ color: 'var(--text-secondary)' }}> — {span.statusMessage}</span>}
      </div>

      {/* Parent chain */}
      {parentChain.length > 0 && (
        <div className="detail-section">
          <div className="detail-section-title">Execution Path</div>
          <div className="parent-chain">
            {parentChain.map((p, i) => (
              <React.Fragment key={p.spanId}>
                <span className="chain-item" title={p.serviceName}>
                  {p.operationName}
                </span>
                <span className="chain-arrow">→</span>
              </React.Fragment>
            ))}
            <span className="chain-item current">{span.operationName}</span>
          </div>
        </div>
      )}

      {/* HTTP info */}
      {httpMethod && (
        <div className="detail-section">
          <div className="detail-section-title">HTTP</div>
          <div className="http-summary">
            <span className="http-method">{httpMethod}</span>
            <span className="http-url">{httpUrl ?? span.attributes['http.path'] ?? ''}</span>
            {httpStatus != null && (
              <span className={`http-status ${httpStatus >= 400 ? 'error' : ''}`}>{httpStatus}</span>
            )}
          </div>
        </div>
      )}

      {/* Database info */}
      {dbSystem && (
        <div className="detail-section">
          <div className="detail-section-title">Database</div>
          <div className="detail-grid">
            <span className="detail-key">System</span>
            <span className="detail-value">{dbSystem}</span>
            {span.attributes['db.name'] && (
              <>
                <span className="detail-key">Database</span>
                <span className="detail-value">{String(span.attributes['db.name'])}</span>
              </>
            )}
            {span.attributes['db.statement'] && (
              <>
                <span className="detail-key">Query</span>
                <span className="detail-value" style={{ whiteSpace: 'pre-wrap', fontSize: 11 }}>{String(span.attributes['db.statement'])}</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* Timing */}
      <div className="detail-section">
        <div className="detail-section-title">Timing</div>
        <div className="detail-grid">
          <span className="detail-key">Started</span>
          <span className="detail-value">{formatTimestamp(span.startTime)}</span>
          {span.endTime && (
            <>
              <span className="detail-key">Ended</span>
              <span className="detail-value">{formatTimestamp(span.endTime)}</span>
            </>
          )}
          <span className="detail-key">Duration</span>
          <span className="detail-value">{formatDuration(span.duration)}</span>
        </div>
      </div>

      {/* IDs */}
      <div className="detail-section">
        <div className="detail-section-title">Identifiers</div>
        <div className="detail-grid">
          <span className="detail-key">Trace ID</span>
          <span className="detail-value">{shortId(span.traceId)}</span>
          <span className="detail-key">Span ID</span>
          <span className="detail-value">{shortId(span.spanId)}</span>
          {span.parentSpanId && (
            <>
              <span className="detail-key">Parent</span>
              <span className="detail-value">{shortId(span.parentSpanId)}</span>
            </>
          )}
        </div>
      </div>

      {/* General attributes */}
      {generalAttrs.length > 0 && (
        <div className="detail-section">
          <div className="detail-section-title">Attributes</div>
          <div className="detail-grid">
            {generalAttrs.map(([key, val]) => (
              <React.Fragment key={key}>
                <span className="detail-key">{key}</span>
                <span className="detail-value">{String(val)}</span>
              </React.Fragment>
            ))}
          </div>
        </div>
      )}

      {/* Events */}
      {span.events.length > 0 && (
        <div className="detail-section">
          <div className="detail-section-title">Events</div>
          {span.events.map((event, i) => (
            <div key={i} className="event-row">
              <span style={{ fontWeight: 500 }}>{event.name}</span>
              <span className="text-muted">{formatTimestamp(event.timestamp)}</span>
              {event.attributes && Object.keys(event.attributes).length > 0 && (
                <div className="detail-grid" style={{ marginTop: 4, marginLeft: 12 }}>
                  {Object.entries(event.attributes).map(([k, v]) => (
                    <React.Fragment key={k}>
                      <span className="detail-key">{k}</span>
                      <span className="detail-value">{String(v)}</span>
                    </React.Fragment>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
