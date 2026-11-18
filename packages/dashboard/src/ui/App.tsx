import React, { useState, useCallback, useEffect } from 'react'
import type { Trace, Span, FluxorySettings } from '@fluxory/core'
import { shortId } from '@fluxory/core'
import { useWebSocket } from './hooks/useWebSocket'
import { useTraces } from './hooks/useTraces'
import FlowGraph from './components/FlowGraph'
import ExecutionFlow from './components/ExecutionFlow'
import TraceList from './components/TraceList'
import Waterfall from './components/Waterfall'
import SpanDetail from './components/SpanDetail'
import Stats from './components/Stats'
import LogViewer from './components/LogViewer'
import Settings from './components/Settings'
import Login from './components/Login'

type ViewMode = 'map' | 'flow'
type NavTab = 'observe' | 'logs' | 'settings'
type AuthState = 'checking' | 'login' | 'ready'

function formatDuration(ms?: number): string {
  if (ms == null) return '--'
  if (ms < 1) return '<1ms'
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-US', {
    hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

function authHeaders(): Record<string, string> {
  const token = sessionStorage.getItem('fluxory_token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

function wsUrl(): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const token = sessionStorage.getItem('fluxory_token')
  const base = `${proto}//${window.location.host}/ws`
  return token ? `${base}?token=${token}` : base
}

export default function App() {
  const [authState, setAuthState] = useState<AuthState>('checking')
  const [token, setToken] = useState<string | null>(sessionStorage.getItem('fluxory_token'))

  useEffect(() => {
    const existing = sessionStorage.getItem('fluxory_token')
    const headers: Record<string, string> = existing ? { Authorization: `Bearer ${existing}` } : {}
    fetch(`${window.location.origin}/api/auth/status`, { headers })
      .then(r => r.json())
      .then(data => {
        if (!data.authRequired) {
          setAuthState('ready')
        } else if (data.authenticated) {
          setAuthState('ready')
        } else {
          sessionStorage.removeItem('fluxory_token')
          setAuthState('login')
        }
      })
      .catch(() => setAuthState('ready'))
  }, [token])

  const handleLogin = useCallback((t: string) => {
    setToken(t)
    setAuthState('ready')
  }, [])

  if (authState === 'checking') {
    return <div className="login-backdrop"><p style={{ color: '#888', fontSize: 14 }}>Loading...</p></div>
  }
  if (authState === 'login') {
    return <Login onLogin={handleLogin} />
  }

  return <Dashboard />
}

function Dashboard() {
  const { connected, topology, stats, recentSpans, logs, settings: wsSettings } = useWebSocket(wsUrl())
  const { traces, selectedTrace, setSelectedTrace, fetchTrace } = useTraces()
  const [viewMode, setViewMode] = useState<ViewMode>('map')
  const [selectedSpan, setSelectedSpan] = useState<Span | null>(null)
  const [activeTab, setActiveTab] = useState<NavTab>('observe')
  const [settings, setSettings] = useState<FluxorySettings>(wsSettings)
  const [services, setServices] = useState<string[]>([])

  useEffect(() => { setSettings(wsSettings) }, [wsSettings])

  useEffect(() => {
    const h = authHeaders()
    fetch(`${window.location.origin}/api/settings`, { headers: h }).then(r => r.ok ? r.json() : null).then(s => { if (s) setSettings(s) }).catch(() => {})
    fetch(`${window.location.origin}/api/services`, { headers: h }).then(r => r.ok ? r.json() : null).then(s => { if (s) setServices(s) }).catch(() => {})
  }, [])

  useEffect(() => {
    const names = topology.nodes.map(n => n.serviceName)
    if (names.length > 0) setServices(names)
  }, [topology])

  const handleSelectTrace = useCallback((trace: Trace) => {
    setSelectedTrace(trace)
    fetchTrace(trace.id)
    setViewMode('flow')
    setSelectedSpan(null)
  }, [fetchTrace, setSelectedTrace])

  const handleBack = useCallback(() => {
    if (selectedSpan) {
      setSelectedSpan(null)
    } else {
      setViewMode('map')
      setSelectedTrace(null)
      setSelectedSpan(null)
    }
  }, [selectedSpan, setSelectedTrace])

  const handleBackToMap = useCallback(() => {
    setViewMode('map')
    setSelectedTrace(null)
    setSelectedSpan(null)
  }, [setSelectedTrace])

  return (
    <div className="layout">
      {/* Header */}
      <header className="header">
        <div className="header-left">
          <div className="logo">
            <div className="logo-icon">
              <svg width="16" height="16" viewBox="0 0 32 32" fill="none">
                <path d="M6 16h5l3-7 4 14 3-7h5" stroke="#fafafa" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            fluxory
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div className={connected ? 'live-dot' : ''} style={connected ? {} : { width: 8, height: 8, borderRadius: '50%', background: 'var(--text-muted)' }} />
            <span style={{ fontSize: 12, color: connected ? 'var(--success)' : 'var(--text-muted)' }}>
              {connected ? 'live' : 'disconnected'}
            </span>
          </div>
          <nav className="nav-tabs">
            <button className={`nav-tab ${activeTab === 'observe' ? 'active' : ''}`} onClick={() => setActiveTab('observe')}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
              Observe
            </button>
            <button className={`nav-tab ${activeTab === 'logs' ? 'active' : ''}`} onClick={() => setActiveTab('logs')}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="8" y1="13" x2="16" y2="13" />
                <line x1="8" y1="17" x2="12" y2="17" />
              </svg>
              Logs
              {logs.filter(l => l.level === 'error').length > 0 && (
                <span className="nav-badge">{logs.filter(l => l.level === 'error').length}</span>
              )}
            </button>
            <button className={`nav-tab ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" />
                <line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" />
                <line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" />
                <line x1="1" y1="14" x2="7" y2="14" /><line x1="9" y1="8" x2="15" y2="8" /><line x1="17" y1="16" x2="23" y2="16" />
              </svg>
              Settings
            </button>
          </nav>
          {activeTab === 'observe' && (
            <div className="mode-toggle">
              <button
                className={`mode-btn ${viewMode === 'map' ? 'active' : ''}`}
                onClick={handleBackToMap}
              >
                Service Map
              </button>
              <button
                className={`mode-btn ${viewMode === 'flow' ? 'active' : ''}`}
                onClick={() => { if (selectedTrace) setViewMode('flow') }}
                disabled={!selectedTrace}
                title={!selectedTrace ? 'Select a trace first' : ''}
              >
                Execution Flow
              </button>
            </div>
          )}
        </div>
        <Stats stats={stats} connected={connected} />
      </header>

      {activeTab === 'observe' && (
        <>
          {/* Graph */}
          <div className="graph-panel">
            {viewMode === 'map' ? (
              <FlowGraph topology={topology} recentSpans={recentSpans} />
            ) : selectedTrace ? (
              <ExecutionFlow trace={selectedTrace} />
            ) : (
              <FlowGraph topology={topology} recentSpans={recentSpans} />
            )}
          </div>

          {/* Side Panel */}
          <div className="side-panel">
            {viewMode === 'flow' && selectedTrace ? (
              <>
                <div className="inspector-header">
                  <button className="back-btn" onClick={handleBackToMap}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M19 12H5M12 19l-7-7 7-7" />
                    </svg>
                    All traces
                  </button>
                </div>
                <div className="trace-overview">
                  <div className="trace-overview-title">
                    <span className={`status-dot ${selectedTrace.hasError ? 'error' : 'ok'}`} />
                    <span style={{ fontWeight: 600, fontSize: 14 }}>
                      {selectedTrace.rootSpan?.operationName ?? 'Trace'}
                    </span>
                  </div>
                  <div className="trace-overview-meta">
                    <div className="trace-overview-item">
                      <span className="detail-key">Trace</span>
                      <span className="detail-value">{shortId(selectedTrace.id)}</span>
                    </div>
                    <div className="trace-overview-item">
                      <span className="detail-key">Duration</span>
                      <span className="detail-value">{formatDuration(selectedTrace.duration)}</span>
                    </div>
                    <div className="trace-overview-item">
                      <span className="detail-key">Started</span>
                      <span className="detail-value">{formatTime(selectedTrace.startTime)}</span>
                    </div>
                    <div className="trace-overview-item">
                      <span className="detail-key">Spans</span>
                      <span className="detail-value">{selectedTrace.spans.length}</span>
                    </div>
                  </div>
                  <div className="trace-overview-services">
                    {selectedTrace.services.map((s, i) => (
                      <React.Fragment key={s}>
                        {i > 0 && <span className="trace-path-arrow">→</span>}
                        <span className="service-badge">{s}</span>
                      </React.Fragment>
                    ))}
                  </div>
                  {selectedTrace.hasError && (
                    <div className="trace-overview-error">
                      {selectedTrace.spans
                        .filter(s => s.status === 'error')
                        .map(s => (
                          <div key={s.spanId} className="error-hint" onClick={() => setSelectedSpan(s)}>
                            <span className="status-dot error" />
                            <span>{s.operationName}</span>
                            {s.statusMessage && <span className="text-muted"> — {s.statusMessage}</span>}
                          </div>
                        ))
                      }
                    </div>
                  )}
                </div>
                <div className="panel-tabs">
                  <button className={`panel-tab ${!selectedSpan ? 'active' : ''}`} onClick={() => setSelectedSpan(null)}>Waterfall</button>
                  {selectedSpan && <button className="panel-tab active">Span Detail</button>}
                </div>
                <div className="panel-content">
                  {selectedSpan ? (
                    <SpanDetail span={selectedSpan} onClose={() => setSelectedSpan(null)} allSpans={selectedTrace.spans} />
                  ) : (
                    <Waterfall trace={selectedTrace} onSelectSpan={setSelectedSpan} selectedSpanId={selectedSpan?.spanId} />
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="panel-tabs">
                  <button className="panel-tab active">Traces</button>
                </div>
                <div className="panel-content">
                  <TraceList traces={traces} selectedTraceId={selectedTrace?.id} onSelect={handleSelectTrace} />
                </div>
              </>
            )}
          </div>
        </>
      )}

      {activeTab === 'logs' && (
        <div className="full-panel">
          <LogViewer logs={logs} services={services} />
        </div>
      )}

      {activeTab === 'settings' && (
        <div className="full-panel">
          <Settings settings={settings} onSettingsChange={setSettings} />
        </div>
      )}
    </div>
  )
}
