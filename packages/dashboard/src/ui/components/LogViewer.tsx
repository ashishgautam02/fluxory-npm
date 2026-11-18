import React, { useState, useMemo, useRef, useEffect } from 'react'
import type { LogEntry, LogLevel } from '@fluxory/core'

function formatTime(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
    + '.' + String(d.getMilliseconds()).padStart(3, '0')
}

const LEVEL_CLASS: Record<LogLevel, string> = {
  debug: 'log-debug',
  info: 'log-info',
  warn: 'log-warn',
  error: 'log-error',
}

interface LogViewerProps {
  logs: LogEntry[]
  services: string[]
}

export default function LogViewer({ logs, services }: LogViewerProps) {
  const [selectedService, setSelectedService] = useState<string>('all')
  const [selectedLevel, setSelectedLevel] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [autoScroll, setAutoScroll] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)

  const filtered = useMemo(() => {
    let result = logs
    if (selectedService !== 'all') result = result.filter(l => l.serviceName === selectedService)
    if (selectedLevel !== 'all') result = result.filter(l => l.level === selectedLevel)
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(l => l.message.toLowerCase().includes(q))
    }
    return result
  }, [logs, selectedService, selectedLevel, search])

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [filtered.length, autoScroll])

  return (
    <div className="log-viewer">
      <div className="log-toolbar">
        <select
          className="log-select"
          value={selectedService}
          onChange={e => setSelectedService(e.target.value)}
        >
          <option value="all">All Services</option>
          {services.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select
          className="log-select"
          value={selectedLevel}
          onChange={e => setSelectedLevel(e.target.value)}
        >
          <option value="all">All Levels</option>
          <option value="debug">Debug</option>
          <option value="info">Info</option>
          <option value="warn">Warn</option>
          <option value="error">Error</option>
        </select>
        <input
          className="log-search"
          type="text"
          placeholder="Search logs..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <button
          className={`log-autoscroll-btn ${autoScroll ? 'active' : ''}`}
          onClick={() => setAutoScroll(!autoScroll)}
          title="Auto-scroll to latest"
        >
          ↓
        </button>
        <span className="log-count">{filtered.length} logs</span>
      </div>
      <div className="log-terminal" ref={scrollRef}>
        {filtered.length === 0 ? (
          <div className="log-empty">
            No logs yet. Use <code>fluxory.log()</code>, <code>.info()</code>, <code>.warn()</code>, <code>.error()</code> to send logs.
          </div>
        ) : (
          filtered.map((log, i) => (
            <div key={i} className={`log-line ${LEVEL_CLASS[log.level]}`}>
              <span className="log-time">{formatTime(log.timestamp)}</span>
              <span className={`log-level-badge ${log.level}`}>{log.level.toUpperCase().padEnd(5)}</span>
              <span className="log-service">[{log.serviceName}]</span>
              <span className="log-message">{log.message}</span>
              {log.traceId && <span className="log-trace-link" title={log.traceId}>⟡</span>}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
