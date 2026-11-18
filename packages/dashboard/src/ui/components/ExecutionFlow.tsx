import React, { memo, useMemo, useEffect } from 'react'
import ReactFlow, {
  Background, type Node, type Edge,
  BackgroundVariant, useNodesState, useEdgesState,
  Handle, Position, type NodeProps,
} from 'reactflow'
import 'reactflow/dist/style.css'
import dagre from 'dagre'
import type { Trace, Span, ServiceType } from '@fluxory/core'
import AnimatedEdge from './AnimatedEdge'

interface ExecNodeData {
  serviceName: string
  serviceType: ServiceType
  operations: { name: string; duration: number; status: string }[]
  totalDuration: number
  hasError: boolean
  order: number
}

const ICONS: Record<ServiceType, string> = {
  browser: '🌐', server: '⚙️', database: '🗄️',
  cache: '⚡', queue: '📨', external: '🔗',
}

function formatMs(ms: number): string {
  if (ms < 1) return '<1ms'
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function ExecNodeComponent({ data }: NodeProps<ExecNodeData>) {
  return (
    <>
      <Handle type="target" position={Position.Left} style={{ background: 'var(--border)', border: 'none', width: 8, height: 8 }} />
      <div className={`exec-node ${data.hasError ? 'has-error' : ''}`}>
        <div className="exec-node-badge">{data.order}</div>
        <div className="service-node-header">
          <div className={`service-icon ${data.serviceType}`}>
            {ICONS[data.serviceType] ?? '📦'}
          </div>
          <div style={{ overflow: 'hidden' }}>
            <div className="service-name">{data.serviceName}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              {data.operations.length} op{data.operations.length !== 1 ? 's' : ''} · {formatMs(data.totalDuration)}
            </div>
          </div>
        </div>
        <div className="exec-node-ops">
          {data.operations.slice(0, 4).map((op, i) => (
            <div key={i} className={`exec-op ${op.status === 'error' ? 'error' : ''}`}>
              <span className={`status-dot ${op.status === 'error' ? 'error' : 'ok'}`} style={{ width: 5, height: 5 }} />
              <span className="exec-op-name">{op.name}</span>
              <span className="exec-op-dur">{formatMs(op.duration)}</span>
            </div>
          ))}
          {data.operations.length > 4 && (
            <div className="exec-op-more">+{data.operations.length - 4} more</div>
          )}
        </div>
      </div>
      <Handle type="source" position={Position.Right} style={{ background: 'var(--border)', border: 'none', width: 8, height: 8 }} />
    </>
  )
}

const nodeTypes = { exec: memo(ExecNodeComponent) }
const edgeTypes = { animated: AnimatedEdge }

function buildGraph(trace: Trace): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'LR', ranksep: 160, nodesep: 60, marginx: 40, marginy: 40 })

  const serviceSpans = new Map<string, Span[]>()
  for (const span of trace.spans) {
    const list = serviceSpans.get(span.serviceName) || []
    list.push(span)
    serviceSpans.set(span.serviceName, list)
  }

  const ordered = [...serviceSpans.entries()]
    .sort(([, a], [, b]) => Math.min(...a.map(s => s.startTime)) - Math.min(...b.map(s => s.startTime)))

  for (const [name, spans] of ordered) {
    const h = 72 + Math.min(spans.length, 4) * 22 + 8
    g.setNode(name, { width: 220, height: h })
  }

  const edgeMap = new Map<string, { source: string; target: string; spans: Span[] }>()
  for (const span of trace.spans) {
    if (!span.parentSpanId) continue
    const parent = trace.spans.find(s => s.spanId === span.parentSpanId)
    if (!parent || parent.serviceName === span.serviceName) continue
    const key = `${parent.serviceName}→${span.serviceName}`
    const e = edgeMap.get(key)
    if (e) e.spans.push(span)
    else {
      edgeMap.set(key, { source: parent.serviceName, target: span.serviceName, spans: [span] })
      g.setEdge(parent.serviceName, span.serviceName)
    }
  }

  dagre.layout(g)

  const nodes: Node[] = ordered.map(([name, spans], i) => {
    const pos = g.node(name)
    return {
      id: name,
      type: 'exec',
      position: { x: (pos?.x ?? 0) - 110, y: (pos?.y ?? 0) - 50 },
      data: {
        serviceName: name,
        serviceType: spans[0]?.serviceType ?? 'server',
        operations: spans.sort((a, b) => a.startTime - b.startTime).map(s => ({
          name: s.operationName, duration: s.duration ?? 0, status: s.status,
        })),
        totalDuration: spans.reduce((sum, s) => sum + (s.duration ?? 0), 0),
        hasError: spans.some(s => s.status === 'error'),
        order: i + 1,
      } as ExecNodeData,
    }
  })

  const edges: Edge[] = [...edgeMap.values()].map(({ source, target, spans }) => ({
    id: `${source}→${target}`,
    source,
    target,
    type: 'animated',
    data: {
      requestCount: spans.length,
      errorCount: spans.filter(s => s.status === 'error').length,
      avgLatency: spans.reduce((sum, s) => sum + (s.duration ?? 0), 0) / spans.length,
      isActive: true,
    },
  }))

  return { nodes, edges }
}

interface Props {
  trace: Trace
}

export default function ExecutionFlow({ trace }: Props) {
  const { nodes: layoutNodes, edges: layoutEdges } = useMemo(() => buildGraph(trace), [trace])
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])

  useEffect(() => {
    setNodes(layoutNodes)
    setEdges(layoutEdges)
  }, [layoutNodes, layoutEdges, setNodes, setEdges])

  if (trace.services.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">🔍</div>
        <h2>No execution data</h2>
        <p>This trace has no span data to visualize.</p>
      </div>
    )
  }

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      fitView
      fitViewOptions={{ padding: 0.3 }}
      minZoom={0.3}
      maxZoom={2}
      proOptions={{ hideAttribution: true }}
    >
      <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--border)" />
    </ReactFlow>
  )
}
