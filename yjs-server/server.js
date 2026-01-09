import { WebSocketServer } from 'ws'
import * as Y from 'yjs'
import { setupWSConnection } from 'y-websocket/bin/utils'

const port = 1234

const wss = new WebSocketServer({ port })

wss.on('connection', (ws, req) => {
  console.log('Client connected:', req.url)
  setupWSConnection(ws, req)
})

console.log(`y-websocket server running on port ${port}`)
