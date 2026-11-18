import { useState, useEffect, useCallback } from 'react'
import type { Trace } from '@fluxory/core'

const API_BASE = window.location.origin

function authHeaders(): Record<string, string> {
  const token = sessionStorage.getItem('fluxory_token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export function useTraces() {
  const [traces, setTraces] = useState<Trace[]>([])
  const [selectedTrace, setSelectedTrace] = useState<Trace | null>(null)
  const [loading, setLoading] = useState(false)

  const fetchTraces = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/traces?limit=100`, { headers: authHeaders() })
      if (res.ok) {
        const data = await res.json()
        setTraces(data)
      }
    } catch {}
  }, [])

  const fetchTrace = useCallback(async (traceId: string) => {
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/traces/${traceId}`, { headers: authHeaders() })
      if (res.ok) {
        const data = await res.json()
        setSelectedTrace(data)
      }
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchTraces()
    const interval = setInterval(fetchTraces, 3000)
    return () => clearInterval(interval)
  }, [fetchTraces])

  return { traces, selectedTrace, setSelectedTrace, fetchTrace, loading, refresh: fetchTraces }
}
