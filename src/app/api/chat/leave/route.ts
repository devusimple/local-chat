import { NextResponse } from 'next/server'
import { store } from '@/lib/chat-store'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { userId, username } = body

    if (userId) {
      const user = store.getUser(userId)
      if (user) {
        store.removeUser(userId)
        store.addSystemMessage(`${user.username} left the chat`)
      }
    } else if (username) {
      const user = Array.from(store.users.values()).find(u => u.username === username)
      if (user) {
        store.removeUser(user.id)
        store.addSystemMessage(`${user.username} left the chat`)
      }
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON' },
      { status: 400 }
    )
  }
}
