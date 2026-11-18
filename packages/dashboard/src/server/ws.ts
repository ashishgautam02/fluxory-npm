import { WebSocketServer, WebSocket } from 'ws'
import type { Server, IncomingMessage } from 'http'
import { URL } from 'url'
import type { Span, LogEntry, FluxorySettings, WSMessage } from '@fluxory/core'
import type { SpanStore } from './store'

export class WsBroadcaster {
  private wss: WebSocketServer
  private store: SpanStore

  constructor(server: Server, store: SpanStore, authCheck?: (req: IncomingMessage) => boolean) {
    this.store = store
    this.wss = new WebSocketServer({ server, path: '/ws' })

    this.wss.on('connection', (ws, req) => {
      if (authCheck && !authCheck(req)) {
        ws.close(4001, 'Unauthorized')
        return
      }
      this.send(ws, { type: 'connected', data: { timestamp: Date.now() } })
      this.send(ws, { type: 'topology', data: store.getTopology() })
      this.send(ws, { type: 'stats', data: store.getStats() })
    })
  }

  broadcastSpan(span: Span): void {
    this.broadcast({ type: 'span', data: span })
  }

  broadcastTopology(): void {
    this.broadcast({ type: 'topology', data: this.store.getTopology() })
  }

  broadcastStats(): void {
    this.broadcast({ type: 'stats', data: this.store.getStats() })
  }

  broadcastLog(log: LogEntry): void {
    this.broadcast({ type: 'log', data: log })
  }

  broadcastSettings(settings: FluxorySettings): void {
    this.broadcast({ type: 'settings', data: settings })
  }

  private broadcast(msg: WSMessage): void {
    const data = JSON.stringify(msg)
    for (const client of this.wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data)
      }
    }
  }

  private send(ws: WebSocket, msg: WSMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg))
    }
  }

  get clientCount(): number {
    return this.wss.clients.size
  }
}
