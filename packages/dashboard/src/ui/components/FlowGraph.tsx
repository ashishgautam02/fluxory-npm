import React, { useMemo, useEffect, useRef, useState } from 'react'
import ReactFlow, {
  Background, Controls, type Node, type Edge,
  BackgroundVariant, useNodesState, useEdgesState,
} from 'reactflow'
import 'reactflow/dist/style.css'
import dagre from 'dagre'
import type { Topology, Span, ServiceType } from '@fluxory/core'
import ServiceNode from './ServiceNode'
import AnimatedEdge from './AnimatedEdge'

const nodeTypes = { service: ServiceNode }
const edgeTypes = { animated: AnimatedEdge }

const TYPE_ORDER: Record<ServiceType, number> = {
  browser: 0, server: 1, external: 2, cache: 3, queue: 4, database: 5,
}

function layoutGraph(topology: Topology, activeServices: Set<string>): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'LR', ranksep: 120, nodesep: 60, marginx: 40, marginy: 40 })

  const sortedNodes = [...topology.nodes].sort((a, b) =>
    (TYPE_ORDER[a.serviceType] ?? 3) - (TYPE_ORDER[b.serviceType] ?? 3)
  )

  for (const node of sortedNodes) {
    g.setNode(node.id, { width: 180, height: 70 })
  }

  for (const edge of topology.edges) {
    g.setEdge(edge.source, edge.target)
  }

  dagre.layout(g)

  const nodes: Node[] = sortedNodes.map(node => {
    const pos = g.node(node.id)
    return {
      id: node.id,
      type: 'service',
      position: { x: (pos?.x ?? 0) - 90, y: (pos?.y ?? 0) - 35 },
      data: {
        serviceName: node.serviceName,
        serviceType: node.serviceType,
        requestCount: node.requestCount,
        errorCount: node.errorCount,
        avgLatency: node.avgLatency,
        isActive: activeServices.has(node.id),
      },
    }
  })

  const edges: Edge[] = topology.edges.map(edge => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    type: 'animated',
    data: {
      requestCount: edge.requestCount,
      errorCount: edge.errorCount,
      avgLatency: edge.avgLatency,
      isActive: activeServices.has(edge.source) || activeServices.has(edge.target),
    },
  }))

  return { nodes, edges }
}

interface FlowGraphProps {
  topology: Topology
  recentSpans: Span[]
}

export default function FlowGraph({ topology, recentSpans }: FlowGraphProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [activeServices, setActiveServices] = useState<Set<string>>(new Set())
  const activityTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  useEffect(() => {
    for (const span of recentSpans.slice(0, 10)) {
      setActiveServices(prev => {
        const next = new Set(prev)
        next.add(span.serviceName)
        return next
      })

      const existing = activityTimers.current.get(span.serviceName)
      if (existing) clearTimeout(existing)

      activityTimers.current.set(
        span.serviceName,
        setTimeout(() => {
          setActiveServices(prev => {
            const next = new Set(prev)
            next.delete(span.serviceName)
            return next
          })
          activityTimers.current.delete(span.serviceName)
        }, 3000),
      )
    }
  }, [recentSpans])

  useEffect(() => {
    if (topology.nodes.length === 0) return
    const { nodes: newNodes, edges: newEdges } = layoutGraph(topology, activeServices)
    setNodes(newNodes)
    setEdges(newEdges)
  }, [topology, activeServices, setNodes, setEdges])

  if (topology.nodes.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">📡</div>
        <h2>No services detected</h2>
        <p>
          Add <code>@fluxory/node</code> to your backend or <code>@fluxory/client</code> to your frontend to start seeing live data flow.
        </p>
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
      <Controls
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}
      />
    </ReactFlow>
  )
}
