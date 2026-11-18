import React, { useState, useCallback } from 'react'

interface LoginProps {
  onLogin: (token: string) => void
}

export default function Login({ onLogin }: LoginProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [shake, setShake] = useState(false)

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch(`${window.location.origin}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const data = await res.json()
      if (res.ok && data.token) {
        sessionStorage.setItem('fluxory_token', data.token)
        onLogin(data.token)
      } else {
        setError(data.error || 'Login failed')
        setShake(true)
        setTimeout(() => setShake(false), 500)
      }
    } catch {
      setError('Connection failed')
      setShake(true)
      setTimeout(() => setShake(false), 500)
    } finally {
      setLoading(false)
    }
  }, [username, password, onLogin])

  return (
    <div className="login-backdrop">
      <div className="login-grid" />
      <div className="login-glow" />

      <form className={`login-card${shake ? ' login-shake' : ''}`} onSubmit={handleSubmit}>
        <div className="login-header">
          <div className="login-logo-mark">
            <svg width="24" height="24" viewBox="0 0 32 32" fill="none">
              <path d="M6 16h5l3-7 4 14 3-7h5" stroke="#fafafa" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h1 className="login-title">fluxory</h1>
          <p className="login-subtitle">Sign in to continue to your dashboard</p>
        </div>

        {error && (
          <div className="login-error">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            {error}
          </div>
        )}

        <div className="login-fields">
          <div className="login-field">
            <label className="login-label" htmlFor="login-user">Username</label>
            <div className="login-input-wrap">
              <svg className="login-input-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              <input
                id="login-user"
                className="login-input"
                type="text"
                placeholder="Enter your username"
                autoFocus
                value={username}
                onChange={e => setUsername(e.target.value)}
                autoComplete="username"
              />
            </div>
          </div>

          <div className="login-field">
            <label className="login-label" htmlFor="login-pass">Password</label>
            <div className="login-input-wrap">
              <svg className="login-input-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <input
                id="login-pass"
                className="login-input"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
          </div>
        </div>

        <button className="login-btn" type="submit" disabled={loading || !username || !password}>
          {loading ? (
            <span className="login-btn-loading">
              <svg className="login-spinner" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
              </svg>
              Signing in...
            </span>
          ) : (
            <span className="login-btn-content">
              Sign in
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </span>
          )}
        </button>

        <p className="login-footer">Protected by fluxory security</p>
      </form>
    </div>
  )
}
