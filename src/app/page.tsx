'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { io, Socket } from 'socket.io-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { MessageCircle, Users, Send, Code2, Copy, Check } from 'lucide-react'

interface User {
  id: string
  username: string
  color: string
}

interface Message {
  id: string
  username: string
  content: string
  timestamp: Date | string
  type: 'user' | 'system'
  color: string
}

// Detect if WebSocket is available (development mode with mini-service)
const useWebSocket = () => {
  // Only use WebSocket in development or when explicitly enabled
  if (typeof window !== 'undefined') {
    const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    const hasWsParam = new URLSearchParams(window.location.search).has('ws')
    return isDev || hasWsParam
  }
  return false
}

export default function ChatApp() {
  const [messages, setMessages] = useState<Message[]>([])
  const [inputMessage, setInputMessage] = useState('')
  const [username, setUsername] = useState('')
  const [isJoined, setIsJoined] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const [users, setUsers] = useState<User[]>([])
  const [typingUser, setTypingUser] = useState<string | null>(null)
  const [userId, setUserId] = useState<string>('')
  const [copied, setCopied] = useState<string | null>(null)

  const socketRef = useRef<Socket | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const lastMessageIdRef = useRef<string>('')

  const isWebSocketMode = useWebSocket()

  // WebSocket mode (development)
  useEffect(() => {
    if (!isWebSocketMode || !isJoined) return

    const socket = io('/?XTransformPort=3003', {
      transports: ['websocket', 'polling'],
      forceNew: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    })

    socketRef.current = socket

    socket.on('connect', () => setIsConnected(true))
    socket.on('disconnect', () => setIsConnected(false))
    socket.on('recent-messages', (msgs: Message[]) => setMessages(msgs))
    socket.on('message', (msg: Message) => setMessages(prev => [...prev, msg]))
    socket.on('user-joined', (data: { user: User; message: Message }) => {
      setMessages(prev => [...prev, data.message])
      setUsers(prev => prev.find(u => u.id === data.user.id) ? prev : [...prev, data.user])
    })
    socket.on('user-left', (data: { user: User; message: Message }) => {
      setMessages(prev => [...prev, data.message])
      setUsers(prev => prev.filter(u => u.id !== data.user.id))
    })
    socket.on('users-list', (data: { users: User[] }) => setUsers(data.users))
    socket.on('user-typing', (data: { username: string }) => {
      setTypingUser(data.username)
      setTimeout(() => setTypingUser(null), 2000)
    })

    return () => socket.disconnect()
  }, [isWebSocketMode, isJoined])

  // HTTP polling mode (production)
  useEffect(() => {
    if (isWebSocketMode || !isJoined || !userId) return

    setIsConnected(true)

    // Poll every 1 second for updates
    pollIntervalRef.current = setInterval(async () => {
      try {
        const res = await fetch('/api/chat/poll', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            username,
            lastMessageId: lastMessageIdRef.current
          })
        })
        const { data } = await res.json()

        if (data.messages.length > 0) {
          setMessages(prev => {
            const allMessages = [...prev, ...data.messages]
            // Deduplicate by id
            const unique = allMessages.filter((msg, index, self) =>
              index === self.findIndex(m => m.id === msg.id)
            )
            return unique
          })
          // Update last message id
          if (data.messages.length > 0) {
            lastMessageIdRef.current = data.messages[data.messages.length - 1].id
          }
        }

        setUsers(data.users)
      } catch (err) {
        console.error('Poll error:', err)
      }
    }, 1000)

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
      }
    }
  }, [isWebSocketMode, isJoined, userId, username])

  // Auto scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const handleJoin = useCallback(async () => {
    if (!username.trim()) return

    if (isWebSocketMode) {
      // WebSocket join
      if (socketRef.current) {
        socketRef.current.emit('join', { username: username.trim() })
        setIsJoined(true)
        setIsConnected(true)
      }
    } else {
      // HTTP join
      try {
        const res = await fetch('/api/chat/join', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: username.trim() })
        })
        const { data } = await res.json()

        setUserId(data.user.id)
        setMessages(data.messages)
        setUsers(data.users)
        setIsJoined(true)
        setIsConnected(true)

        if (data.messages.length > 0) {
          lastMessageIdRef.current = data.messages[data.messages.length - 1].id
        }
      } catch (err) {
        console.error('Join error:', err)
      }
    }
  }, [username, isWebSocketMode])

  const sendMessage = useCallback(async () => {
    if (!inputMessage.trim() || !isJoined) return

    if (isWebSocketMode) {
      socketRef.current?.emit('message', { content: inputMessage.trim() })
    } else {
      try {
        const res = await fetch('/api/chat/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, content: inputMessage.trim() })
        })
        const { data } = await res.json()
        lastMessageIdRef.current = data.id
      } catch (err) {
        console.error('Send error:', err)
      }
    }

    setInputMessage('')
  }, [inputMessage, isJoined, isWebSocketMode, username])

  const handleTyping = useCallback(() => {
    if (isWebSocketMode && socketRef.current && isJoined) {
      socketRef.current.emit('typing')
    }
  }, [isWebSocketMode, isJoined])

  const formatTime = (timestamp: Date | string) => {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const copyCode = (code: string, key: string) => {
    navigator.clipboard.writeText(code)
    setCopied(key)
    setTimeout(() => setCopied(null), 2000)
  }

  // Login screen
  if (!isJoined) {
    return (
      <div className="h-screen flex items-center justify-center p-4 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
        <Card className="w-full max-w-md shadow-xl">
          <CardHeader className="text-center space-y-4">
            <div className="flex justify-center">
              <div className="w-16 h-16 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl flex items-center justify-center">
                <MessageCircle className="w-8 h-8 text-white" />
              </div>
            </div>
            <div>
              <CardTitle className="text-2xl">Public Chat Room</CardTitle>
              <p className="text-muted-foreground mt-2">Join the conversation!</p>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2 text-sm">
              <span className={`w-2 h-2 rounded-full ${isConnected || isWebSocketMode ? 'bg-emerald-500' : 'bg-amber-500'}`} />
              <span className="text-emerald-600">
                {isWebSocketMode ? 'WebSocket Mode (Dev)' : 'HTTP Polling Mode (Prod)'}
              </span>
            </div>
            <div className="space-y-2">
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                placeholder="Enter your nickname..."
                className="text-lg h-12"
                maxLength={20}
              />
              <Button
                onClick={handleJoin}
                disabled={!username.trim()}
                className="w-full h-12 text-lg bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700"
              >
                Join Chat
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      {/* Header */}
      <header className="shrink-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center">
              <MessageCircle className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-lg">Public Chat</h1>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-red-500'}`} />
                {isConnected ? (isWebSocketMode ? 'WebSocket' : 'HTTP Polling') : 'Disconnected'}
              </div>
            </div>
          </div>
          <Badge variant="secondary" className="gap-1">
            <Users className="w-3 h-3" />
            {users.length} online
          </Badge>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 min-h-0 flex gap-4 p-4 max-w-6xl w-full mx-auto">
        {/* Messages area */}
        <div className="flex-1 flex flex-col min-h-0 bg-white dark:bg-slate-900 rounded-2xl shadow-lg overflow-hidden">
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
            <div className="space-y-3">
              {messages.length === 0 ? (
                <div className="text-center text-muted-foreground py-12">
                  <MessageCircle className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>No messages yet. Say hello!</p>
                </div>
              ) : (
                messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex gap-3 ${msg.type === 'system' ? 'justify-center' : ''}`}
                  >
                    {msg.type === 'system' ? (
                      <div className="bg-muted/50 px-4 py-1.5 rounded-full text-sm text-muted-foreground">
                        {msg.content}
                      </div>
                    ) : (
                      <>
                        <Avatar className="w-8 h-8 shrink-0">
                          <AvatarFallback style={{ backgroundColor: msg.color, color: 'white' }} className="text-xs font-semibold">
                            {msg.username.slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2">
                            <span className="font-semibold text-sm" style={{ color: msg.color }}>
                              {msg.username}
                            </span>
                            <span className="text-xs text-muted-foreground">{formatTime(msg.timestamp)}</span>
                          </div>
                          <p className="text-sm break-words">{msg.content}</p>
                        </div>
                      </>
                    )}
                  </div>
                ))
              )}
              {typingUser && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                  <span>{typingUser} is typing...</span>
                </div>
              )}
            </div>
          </div>

          {/* Input area */}
          <div className="shrink-0 p-4 border-t bg-muted/30">
            <div className="flex gap-2">
              <Input
                value={inputMessage}
                onChange={(e) => { setInputMessage(e.target.value); handleTyping() }}
                onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                placeholder="Type a message..."
                disabled={!isConnected}
                className="flex-1"
                maxLength={500}
              />
              <Button onClick={sendMessage} disabled={!isConnected || !inputMessage.trim()} className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700">
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Sidebar - Online users */}
        <div className="w-56 hidden md:flex flex-col shrink-0 bg-white dark:bg-slate-900 rounded-2xl shadow-lg overflow-hidden">
          <div className="shrink-0 p-4 border-b">
            <h2 className="font-semibold text-sm flex items-center gap-2">
              <Users className="w-4 h-4" />
              Online Users
            </h2>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {users.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No users</p>
            ) : (
              <div className="space-y-1">
                {users.map((user) => (
                  <div key={user.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted/50">
                    <Avatar className="w-7 h-7">
                      <AvatarFallback style={{ backgroundColor: user.color, color: 'white' }} className="text-xs font-semibold">
                        {user.username.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm font-medium truncate">{user.username}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="shrink-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-t">
        <div className="max-w-6xl mx-auto px-4 py-2 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            © 2024 Public Chat • Real-time messaging for everyone
          </p>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Code2 className="w-4 h-4" />
                API Docs
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>API Documentation</DialogTitle>
              </DialogHeader>
              <Tabs defaultValue="python" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="python">Python</TabsTrigger>
                  <TabsTrigger value="go">Go</TabsTrigger>
                  <TabsTrigger value="nodejs">Node.js</TabsTrigger>
                </TabsList>

                <TabsContent value="python" className="space-y-4">
                  <div className="space-y-3">
                    <h3 className="font-semibold">HTTP API</h3>
                    <CodeBlock
                      code={`import requests

BASE_URL = "https://local-chat-two.vercel.app/api/chat"

# Join the chat
response = requests.post(f"{BASE_URL}/join", json={
    "username": "PythonBot"
})
data = response.json()["data"]
user_id = data["user"]["id"]
print(f"Joined as {data['user']['username']}")

# Get all messages
response = requests.get(f"{BASE_URL}/messages")
messages = response.json()["data"]

# Send a message
response = requests.post(f"{BASE_URL}/messages", json={
    "username": "PythonBot",
    "content": "Hello from Python!",
    "color": "#3498db"  # optional
})
message = response.json()["data"]
print(f"Sent: {message['content']}")

# Poll for updates (call every 1-2 seconds)
response = requests.post(f"{BASE_URL}/poll", json={
    "userId": user_id,
    "username": "PythonBot"
})
updates = response.json()["data"]
print(f"New messages: {len(updates['messages'])}")`}
                      language="python"
                      copied={copied}
                      onCopy={copyCode}
                    />
                  </div>
                </TabsContent>

                <TabsContent value="go" className="space-y-4">
                  <div className="space-y-3">
                    <h3 className="font-semibold">HTTP API</h3>
                    <CodeBlock
                      code={`package main

import (
    "encoding/json"
    "fmt"
    "net/http"
    "bytes"
)

const BASE_URL = "https://local-chat-two.vercel.app/api/chat"

type Message struct {
    ID        string \`json:"id"\`
    Username  string \`json:"username"\`
    Content   string \`json:"content"\`
    Timestamp string \`json:"timestamp"\`
    Type      string \`json:"type"\`
    Color     string \`json:"color"\`
}

func main() {
    // Join the chat
    payload := map[string]string{"username": "GoBot"}
    body, _ := json.Marshal(payload)
    resp, _ := http.Post(BASE_URL+"/join", "application/json", bytes.NewBuffer(body))
    var result map[string]interface{}
    json.NewDecoder(resp.Body).Decode(&result)
    fmt.Println("Joined chat")

    // Send a message
    payload = map[string]string{
        "username": "GoBot",
        "content":  "Hello from Go!",
    }
    body, _ = json.Marshal(payload)
    http.Post(BASE_URL+"/messages", "application/json", bytes.NewBuffer(body))
    fmt.Println("Message sent")
}`}
                      language="go"
                      copied={copied}
                      onCopy={copyCode}
                    />
                  </div>
                </TabsContent>

                <TabsContent value="nodejs" className="space-y-4">
                  <div className="space-y-3">
                    <h3 className="font-semibold">HTTP API</h3>
                    <CodeBlock
                      code={`const BASE_URL = "https://local-chat-two.vercel.app/api/chat";

// Join the chat
const joinRes = await fetch(\`\${BASE_URL}/join\`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: "NodeBot" })
});
const { data: joinData } = await joinRes.json();
const userId = joinData.user.id;
console.log(\`Joined as \${joinData.user.username}\`);

// Get all messages
const msgRes = await fetch(\`\${BASE_URL}/messages\`);
const { data: messages } = await msgRes.json();
console.log(\`Messages: \${messages.length}\`);

// Send a message
const sendRes = await fetch(\`\${BASE_URL}/messages\`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    username: "NodeBot",
    content: "Hello from Node.js!",
    color: "#2ecc71"
  })
});
const { data: message } = await sendRes.json();
console.log("Sent:", message.content);

// Poll for updates (call every 1-2 seconds)
const pollRes = await fetch(\`\${BASE_URL}/poll\`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ userId, username: "NodeBot" })
});
const { data: updates } = await pollRes.json();
console.log(\`New messages: \${updates.messages.length}\`);`}
                      language="javascript"
                      copied={copied}
                      onCopy={copyCode}
                    />
                  </div>
                </TabsContent>
              </Tabs>

              <div className="mt-4 p-4 bg-muted rounded-lg">
                <h4 className="font-semibold text-sm mb-2">Available Endpoints</h4>
                <div className="text-xs space-y-1 text-muted-foreground">
                  <div><code className="bg-background px-1 rounded">POST /api/chat/join</code> - Join chat (body: {`{username}`})</div>
                  <div><code className="bg-background px-1 rounded">GET /api/chat/messages</code> - Get all messages</div>
                  <div><code className="bg-background px-1 rounded">POST /api/chat/messages</code> - Send message (body: {`{username, content, color?}`})</div>
                  <div><code className="bg-background px-1 rounded">GET /api/chat/users</code> - Get online users</div>
                  <div><code className="bg-background px-1 rounded">POST /api/chat/poll</code> - Poll for updates (body: {`{userId?, username?, lastMessageId?}`})</div>
                  <div><code className="bg-background px-1 rounded">GET /api/chat/stats</code> - Get chat statistics</div>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </footer>
    </div>
  )
}

// Code block component
function CodeBlock({ code, language, copied, onCopy }: { code: string; language: string; copied: string | null; onCopy: (code: string, key: string) => void }) {
  const key = `${language}-${code.slice(0, 20)}`
  return (
    <div className="relative group">
      <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg text-xs overflow-x-auto">
        <code>{code}</code>
      </pre>
      <Button
        variant="ghost"
        size="sm"
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={() => onCopy(code, key)}
      >
        {copied === key ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
      </Button>
    </div>
  )
}
