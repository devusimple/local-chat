import { NextResponse } from 'next/server'
import { store } from '@/lib/chat-store'

// Poll endpoint - get latest data and update user presence
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { userId, username } = body

    // Update user's last seen time
    if (userId) {
      store.updateUserSeen(userId)
    } else if (username) {
      const user = Array.from(store.users.values()).find(u => u.username === username)
      if (user) {
        store.updateUserSeen(user.id)
      }
    }

    // Get latest message timestamp from client to detect new messages
    const lastMessageId = body.lastMessageId

    const messages = store.getMessages()
    const users = store.getOnlineUsers()

    // Find new messages since last poll
    let newMessages = messages
    if (lastMessageId) {
      const lastIndex = messages.findIndex(m => m.id === lastMessageId)
      if (lastIndex !== -1) {
        newMessages = messages.slice(lastIndex + 1)
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        messages: newMessages,
        users,
        stats: store.getStats()
      }
    })
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON' },
      { status: 400 }
    )
  }
}
