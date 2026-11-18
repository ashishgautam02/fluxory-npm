import React, { useState, useEffect, useCallback } from 'react'
import type { FluxorySettings } from '@fluxory/core'

const COLLECTOR_URL = `${window.location.protocol}//${window.location.host}`

function authHeaders(): Record<string, string> {
  const token = sessionStorage.getItem('fluxory_token')
  return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' }
}

interface SettingsProps {
  settings: FluxorySettings
  onSettingsChange: (settings: FluxorySettings) => void
}

export default function Settings({ settings, onSettingsChange }: SettingsProps) {
  const [local, setLocal] = useState<FluxorySettings>(settings)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => { setLocal(settings) }, [settings])

  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      const res = await fetch(`${COLLECTOR_URL}/api/settings`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify(local),
      })
      if (res.ok) {
        const updated = await res.json()
        onSettingsChange(updated)
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      }
    } finally {
      setSaving(false)
    }
  }, [local, onSettingsChange])

  const handleClear = useCallback(async () => {
    if (!confirm('Clear all traces and logs? This cannot be undone.')) return
    const token = sessionStorage.getItem('fluxory_token')
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {}
    await fetch(`${COLLECTOR_URL}/api/clear`, { method: 'POST', headers })
  }, [])

  const hasChanges = JSON.stringify(local) !== JSON.stringify(settings)

  return (
    <div className="settings-page">
      <div className="settings-header">
        <h2>Settings</h2>
        <p className="settings-description">Configure retention, limits, and sampling for your Fluxory instance.</p>
      </div>

      <div className="settings-section">
        <h3><span className="section-prefix">//</span> Data Retention</h3>
        <div className="settings-field">
          <label>Retention Period</label>
          <div className="settings-input-group">
            <input
              type="number"
              className="settings-input"
              value={local.retentionMinutes}
              min={1}
              onChange={e => setLocal({ ...local, retentionMinutes: parseInt(e.target.value) || 1 })}
            />
            <span className="settings-unit">minutes</span>
          </div>
          <span className="settings-hint">
            {local.retentionMinutes >= 1440
              ? `${(local.retentionMinutes / 1440).toFixed(1)} days`
              : local.retentionMinutes >= 60
                ? `${(local.retentionMinutes / 60).toFixed(1)} hours`
                : `${local.retentionMinutes} minutes`}
            {' '}&mdash; older data is automatically purged
          </span>
        </div>
        <div className="settings-presets">
          {[
            { label: '1h', min: 60 },
            { label: '6h', min: 360 },
            { label: '1d', min: 1440 },
            { label: '3d', min: 4320 },
            { label: '7d', min: 10080 },
          ].map(p => (
            <button
              key={p.label}
              className={`settings-preset ${local.retentionMinutes === p.min ? 'active' : ''}`}
              onClick={() => setLocal({ ...local, retentionMinutes: p.min })}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="settings-section">
        <h3><span className="section-prefix">//</span> Storage Limits</h3>
        <div className="settings-field">
          <label>Max Traces</label>
          <input
            type="number"
            className="settings-input"
            value={local.maxTraces}
            min={100}
            step={1000}
            onChange={e => setLocal({ ...local, maxTraces: parseInt(e.target.value) || 100 })}
          />
          <span className="settings-hint">Maximum number of traces kept in memory</span>
        </div>
        <div className="settings-field">
          <label>Max Logs</label>
          <input
            type="number"
            className="settings-input"
            value={local.maxLogs}
            min={100}
            step={1000}
            onChange={e => setLocal({ ...local, maxLogs: parseInt(e.target.value) || 100 })}
          />
          <span className="settings-hint">Maximum number of log entries kept in memory</span>
        </div>
      </div>

      <div className="settings-section">
        <h3><span className="section-prefix">//</span> Sampling</h3>
        <div className="settings-field">
          <label>Sample Rate</label>
          <div className="settings-input-group">
            <input
              type="range"
              className="settings-range"
              min={0}
              max={1}
              step={0.01}
              value={local.sampleRate}
              onChange={e => setLocal({ ...local, sampleRate: parseFloat(e.target.value) })}
            />
            <span className="settings-range-value">{Math.round(local.sampleRate * 100)}%</span>
          </div>
          <span className="settings-hint">Percentage of spans to collect (1.0 = 100%)</span>
        </div>
      </div>

      <div className="settings-section" style={{ borderColor: 'var(--error)', opacity: 0.9 }}>
        <h3><span className="section-prefix" style={{ color: 'var(--error)' }}>//</span> Danger Zone</h3>
        <div className="settings-field">
          <button className="settings-danger-btn" onClick={handleClear}>
            Clear All Data
          </button>
          <span className="settings-hint">Remove all traces, logs, and topology data</span>
        </div>
      </div>

      <div className="settings-actions">
        <button
          className="settings-save-btn"
          onClick={handleSave}
          disabled={!hasChanges || saving}
        >
          {saving ? 'Saving...' : saved ? 'Saved ✓' : 'Save Settings'}
        </button>
      </div>
    </div>
  )
}
