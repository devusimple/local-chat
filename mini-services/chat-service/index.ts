import { createServer, IncomingMessage, ServerResponse } from 'http'
import { Server } from 'socket.io'

// In-memory storage
interface User {
  id: string
  username: string
  color: string
}

interface Message {
  id: string
  username: string
  content: string
  timestamp: Date
  type: 'user' | 'system'
  color: string
}

const users = new Map<string, User>()
const messages: Message[] = []
const MAX_MESSAGES = 100

const colors = ['#e74c3c', '#3498db', '#2ecc71', '#9b59b6', '#f39c12', '#1abc9c', '#e67e22', '#34495e']

const getRandomColor = () => colors[Math.floor(Math.random() * colors.length)]
const generateId = () => Math.random().toString(36).substr(2, 9)

const createSystemMessage = (content: string): Message => ({
  id: generateId(),
  username: 'System',
  content,
  timestamp: new Date(),
  type: 'system',
  color: '#666666'
})

const createUserMessage = (username: string, content: string, color: string): Message => ({
  id: generateId(),
  username,
  content,
  timestamp: new Date(),
  type: 'user',
  color
})

const addMessage = (message: Message) => {
  messages.push(message)
  if (messages.length > MAX_MESSAGES) {
    messages.shift()
  }
}

const PORT = 3003

// Helper to send JSON response
const sendJson = (res: ServerResponse, status: number, data: unknown) => {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(data))
}

// HTTP request handler
const handleHttpRequest = (req: IncomingMessage, res: ServerResponse): boolean => {
  // CORS headers for all responses
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  const url = new URL(req.url || '/', `http://localhost:${PORT}`)
  const pathname = url.pathname

  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(200)
    res.end()
    return true
  }

  // API Routes
  if (pathname === '/api/messages' && req.method === 'GET') {
    sendJson(res, 200, { success: true, data: messages, count: messages.length })
    return true
  }

  if (pathname === '/api/users' && req.method === 'GET') {
    sendJson(res, 200, { success: true, data: Array.from(users.values()), count: users.size })
    return true
  }

  if (pathname === '/api/stats' && req.method === 'GET') {
    sendJson(res, 200, {
      success: true,
      data: {
        onlineUsers: users.size,
        totalMessages: messages.length,
        userMessages: messages.filter(m => m.type === 'user').length
      }
    })
    return true
  }

  if (pathname === '/api/message' && req.method === 'POST') {
    let body = ''
    req.on('data', chunk => body += chunk)
    req.on('end', () => {
      try {
        const data = JSON.parse(body)
        if (!data.username || !data.content) {
          sendJson(res, 400, { success: false, error: 'username and content required' })
          return
        }
        const color = data.color || getRandomColor()
        const message = createUserMessage(data.username, data.content, color)
        addMessage(message)
        io.emit('message', message)
        sendJson(res, 200, { success: true, data: message })
      } catch {
        sendJson(res, 400, { success: false, error: 'Invalid JSON' })
      }
    })
    return true
  }

  if (pathname === '/api' && req.method === 'GET') {
    sendJson(res, 200, {
      success: true,
      data: {
        name: 'Chat API',
        version: '1.0.0',
        endpoints: {
          'GET /api/messages': 'Get all messages',
          'GET /api/users': 'Get online users',
          'GET /api/stats': 'Get chat statistics',
          'POST /api/message': 'Send a message (body: {username, content, color?})',
          'WebSocket': 'Connect via Socket.IO (path: /socket.io)'
        }
      }
    })
    return true
  }

  // Root path - redirect to API info
  if (pathname === '/' && req.method === 'GET') {
    sendJson(res, 200, {
      success: true,
      message: 'Chat Server Running',
      apiDocs: '/api',
      websocket: 'Use Socket.IO client to connect'
    })
    return true
  }

  return false // Let socket.io handle this request
}

// Create HTTP server
const httpServer = createServer((req, res) => {
  // Try to handle as API request first
  const handled = handleHttpRequest(req, res)
  
  // If not handled and not a socket.io request, return 404
  if (!handled && !req.url?.startsWith('/socket.io')) {
    res.setHeader('Access-Control-Allow-Origin', '*')
    sendJson(res, 404, { success: false, error: 'Not found. See /api for available endpoints.' })
  }
})

// Socket.IO server - use default /socket.io path
const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  pingTimeout: 60000,
  pingInterval: 25000,
})

// WebSocket event handlers
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`)
  socket.emit('recent-messages', messages)

  socket.on('join', (data: { username: string }) => {
    const { username } = data
    const color = getRandomColor()
    const user: User = { id: socket.id, username, color }
    users.set(socket.id, user)
    
    const joinMessage = createSystemMessage(`${username} joined the chat`)
    addMessage(joinMessage)
    io.emit('user-joined', { user, message: joinMessage })
    socket.emit('users-list', { users: Array.from(users.values()) })
    console.log(`${username} joined. Online: ${users.size}`)
  })

  socket.on('message', (data: { content: string }) => {
    const user = users.get(socket.id)
    if (user && data.content?.trim()) {
      const message = createUserMessage(user.username, data.content.trim(), user.color)
      addMessage(message)
      io.emit('message', message)
      console.log(`${user.username}: ${data.content}`)
    }
  })

  socket.on('typing', () => {
    const user = users.get(socket.id)
    if (user) socket.broadcast.emit('user-typing', { username: user.username })
  })

  socket.on('disconnect', () => {
    const user = users.get(socket.id)
    if (user) {
      users.delete(socket.id)
      const leaveMessage = createSystemMessage(`${user.username} left the chat`)
      addMessage(leaveMessage)
      io.emit('user-left', { user: { id: socket.id, username: user.username }, message: leaveMessage })
      console.log(`${user.username} left. Online: ${users.size}`)
    }
  })
})

httpServer.listen(PORT, () => {
  console.log(`Chat service running on port ${PORT}`)
  console.log(`HTTP API: http://localhost:${PORT}/api`)
  console.log(`WebSocket: Use Socket.IO client (default path)`)
})

process.on('SIGTERM', () => {
  console.log('Shutting down...')
  httpServer.close(() => process.exit(0))
})
