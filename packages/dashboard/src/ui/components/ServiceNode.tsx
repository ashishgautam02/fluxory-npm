import React, { memo } from 'react'
import { Handle, Position, type NodeProps } from 'reactflow'
import type { ServiceType } from '@fluxory/core'

interface ServiceNodeData {
  serviceName: string
  serviceType: ServiceType
  requestCount: number
  errorCount: number
  avgLatency: number
  isActive: boolean
}

const ICONS: Record<ServiceType, string> = {
  browser: '🌐',
  server: '⚙️',
  database: '🗄️',
  cache: '⚡',
  queue: '📨',
  external: '🔗',
}

function formatLatency(ms: number): string {
  if (ms < 1) return '<1ms'
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function ServiceNodeComponent({ data }: NodeProps<ServiceNodeData>) {
  const hasError = data.errorCount > 0
  const errorRate = data.requestCount > 0 ? (data.errorCount / data.requestCount) * 100 : 0

  return (
    <>
      <Handle type="target" position={Position.Left} style={{ background: 'var(--border)', border: 'none', width: 8, height: 8 }} />
      <div className={`service-node ${data.isActive ? 'active' : ''} ${hasError ? 'has-error' : ''}`}>
        <div className="service-node-header">
          <div className={`service-icon ${data.serviceType}`}>
            {ICONS[data.serviceType] ?? '📦'}
          </div>
          <span className="service-name">{data.serviceName}</span>
        </div>
        <div className="service-stats">
          <span>{data.requestCount.toLocaleString()} req</span>
          <span>{formatLatency(data.avgLatency)}</span>
          {hasError && (
            <span className="service-stat-error">{errorRate.toFixed(1)}% err</span>
          )}
        </div>
      </div>
      <Handle type="source" position={Position.Right} style={{ background: 'var(--border)', border: 'none', width: 8, height: 8 }} />
    </>
  )
}

export default memo(ServiceNodeComponent)
