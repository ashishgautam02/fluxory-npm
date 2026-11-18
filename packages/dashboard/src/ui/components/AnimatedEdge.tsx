import React, { memo } from 'react'
import { getBezierPath, type EdgeProps } from 'reactflow'

interface AnimatedEdgeData {
  requestCount: number
  errorCount: number
  avgLatency: number
  isActive: boolean
}

function formatLatency(ms: number): string {
  if (ms < 1) return '<1ms'
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function AnimatedEdgeComponent({
  id, sourceX, sourceY, targetX, targetY,
  sourcePosition, targetPosition, data, style,
}: EdgeProps<AnimatedEdgeData>) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX, sourceY, targetX, targetY,
    sourcePosition, targetPosition,
  })

  const hasError = (data?.errorCount ?? 0) > 0
  const strokeColor = hasError ? 'var(--error)' : 'var(--accent)'
  const glowColor = hasError ? 'var(--error-glow)' : 'var(--accent-glow)'
  const strokeWidth = Math.min(1 + Math.log2((data?.requestCount ?? 1) + 1), 4)

  return (
    <g>
      {/* Glow effect */}
      <path
        d={edgePath}
        fill="none"
        stroke={glowColor}
        strokeWidth={strokeWidth + 6}
        style={{ filter: 'blur(4px)' }}
      />

      {/* Base path */}
      <path
        d={edgePath}
        fill="none"
        stroke="var(--border)"
        strokeWidth={strokeWidth + 1}
        strokeLinecap="round"
      />

      {/* Animated dashed overlay */}
      <path
        className="animated-edge-path"
        d={edgePath}
        fill="none"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        style={{ opacity: data?.isActive ? 1 : 0.4 }}
      />

      {/* Flowing particles */}
      {data?.isActive && (
        <>
          <circle r={3} fill={strokeColor} className="edge-particle" style={{ offsetPath: `path('${edgePath}')` }} />
          <circle r={2.5} fill={strokeColor} className="edge-particle" style={{ offsetPath: `path('${edgePath}')`, animationDelay: '0.7s' }} />
          <circle r={2} fill={strokeColor} className="edge-particle" style={{ offsetPath: `path('${edgePath}')`, animationDelay: '1.4s' }} />
        </>
      )}

      {/* Label */}
      <g transform={`translate(${labelX}, ${labelY})`}>
        <rect x={-28} y={-10} width={56} height={20} rx={4} fill="var(--bg-card)" stroke="var(--border)" strokeWidth={1} />
        <text
          textAnchor="middle"
          dominantBaseline="central"
          fill="var(--text-muted)"
          fontSize={10}
          fontFamily="var(--font-mono)"
        >
          {formatLatency(data?.avgLatency ?? 0)}
        </text>
      </g>
    </g>
  )
}

export default memo(AnimatedEdgeComponent)
