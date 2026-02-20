// Global in-memory chat storage
// This persists within a serverless function instance

export interface User {
  id: string
  username: string
  color: string
  lastSeen: number
}

export interface Message {
  id: string
  username: string
  content: string
  timestamp: Date
  type: 'user' | 'system'
  color: string
}

// Use global to persist across hot reloads in development
declare global {
  // eslint-disable-next-line no-var
  var chatStore: {
    users: Map<string, User>
    messages: Message[]
  } | undefined
}

const colors = ['#e74c3c', '#3498db', '#2ecc71', '#9b59b6', '#f39c12', '#1abc9c', '#e67e22', '#34495e']

export const getRandomColor = () => colors[Math.floor(Math.random() * colors.length)]

export const generateId = () => Math.random().toString(36).substr(2, 9)

// Initialize or get the global store
function getStore() {
  if (!global.chatStore) {
    global.chatStore = {
      users: new Map<string, User>(),
      messages: []
    }
  }
  return global.chatStore
}

export const store = {
  get users() {
    return getStore().users
  },
  get messages() {
    return getStore().messages
  },
  
  addUser(username: string): User {
    // Check if user already exists
    const existingUser = Array.from(this.users.values()).find(u => u.username === username)
    if (existingUser) {
      existingUser.lastSeen = Date.now()
      return existingUser
    }
    
    const user: User = {
      id: generateId(),
      username,
      color: getRandomColor(),
      lastSeen: Date.now()
    }
    this.users.set(user.id, user)
    return user
  },

  removeUser(userId: string) {
    this.users.delete(userId)
  },

  getUser(userId: string): User | undefined {
    return this.users.get(userId)
  },

  getOnlineUsers(): User[] {
    // Remove users not seen in last 30 seconds
    const now = Date.now()
    const timeout = 30000
    
    for (const [id, user] of this.users.entries()) {
      if (now - user.lastSeen > timeout) {
        this.users.delete(id)
      }
    }
    
    return Array.from(this.users.values())
  },

  updateUserSeen(userId: string) {
    const user = this.users.get(userId)
    if (user) {
      user.lastSeen = Date.now()
    }
  },

  addMessage(username: string, content: string, color: string, type: 'user' | 'system' = 'user'): Message {
    const message: Message = {
      id: generateId(),
      username,
      content,
      timestamp: new Date(),
      type,
      color
    }
    
    this.messages.push(message)
    
    // Keep only last 100 messages
    if (this.messages.length > 100) {
      this.messages.shift()
    }
    
    return message
  },

  addSystemMessage(content: string): Message {
    return this.addMessage('System', content, '#666666', 'system')
  },

  getMessages(): Message[] {
    return this.messages
  },

  getStats() {
    return {
      onlineUsers: this.getOnlineUsers().length,
      totalMessages: this.messages.length,
      userMessages: this.messages.filter(m => m.type === 'user').length
    }
  }
}
