import React, { useMemo } from 'react'
import type { Trace, Span } from '@fluxory/core'

function formatDuration(ms?: number): string {
  if (ms == null) return '--'
  if (ms < 1) return '<1ms'
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

function getBarClass(span: Span): string {
  if (span.status === 'error') return 'error'
  if (span.serviceType === 'database') return 'database'
  if (span.serviceType === 'cache') return 'cache'
  return 'ok'
}

interface WaterfallProps {
  trace: Trace
  onSelectSpan: (span: Span) => void
  selectedSpanId?: string
}

export default function Waterfall({ trace, onSelectSpan, selectedSpanId }: WaterfallProps) {
  const { spans, traceStart, traceDuration } = useMemo(() => {
    const sorted = [...trace.spans].sort((a, b) => a.startTime - b.startTime)
    const start = sorted[0]?.startTime ?? 0
    let maxEnd = start

    for (const s of sorted) {
      const end = s.startTime + (s.duration ?? 0)
      if (end > maxEnd) maxEnd = end
    }

    return {
      spans: sorted,
      traceStart: start,
      traceDuration: Math.max(maxEnd - start, 1),
    }
  }, [trace])

  return (
    <div className="waterfall">
      {/* Time axis */}
      <div className="waterfall-axis">
        <span>0ms</span>
        <span>{formatDuration(traceDuration / 2)}</span>
        <span>{formatDuration(traceDuration)}</span>
      </div>

      {spans.map((span, i) => {
        const offset = ((span.startTime - traceStart) / traceDuration) * 100
        const width = Math.max(((span.duration ?? 0) / traceDuration) * 100, 0.5)
        const depth = getSpanDepth(span, trace.spans)
        const isNewService = i === 0 || span.serviceName !== spans[i - 1]?.serviceName

        return (
          <React.Fragment key={span.spanId}>
            {isNewService && (
              <div className="waterfall-service-label">{span.serviceName}</div>
            )}
            <div
              className={`waterfall-span ${span.spanId === selectedSpanId ? 'selected' : ''}`}
              onClick={() => onSelectSpan(span)}
              style={{ paddingLeft: `${8 + depth * 12}px`, animation: `fadeIn 0.15s ease ${i * 0.03}s both` }}
            >
              <span className="waterfall-label" title={span.operationName}>
                <span className={`status-dot ${span.status === 'error' ? 'error' : 'ok'}`} style={{ display: 'inline-block', marginRight: 6, verticalAlign: 'middle' }} />
                {span.operationName}
              </span>
              <div className="waterfall-bar-container">
                <div
                  className={`waterfall-bar ${getBarClass(span)}`}
                  style={{ left: `${offset}%`, width: `${width}%` }}
                />
              </div>
              <span className="waterfall-duration">{formatDuration(span.duration)}</span>
            </div>
          </React.Fragment>
        )
      })}
    </div>
  )
}

function getSpanDepth(span: Span, allSpans: Span[]): number {
  let depth = 0
  let current = span
  while (current.parentSpanId && depth < 10) {
    const parent = allSpans.find(s => s.spanId === current.parentSpanId)
    if (!parent) break
    depth++
    current = parent
  }
  return depth
}
