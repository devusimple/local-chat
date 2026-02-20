import { NextResponse } from 'next/server'
import { store } from '@/lib/chat-store'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { username } = body

    if (!username) {
      return NextResponse.json(
        { success: false, error: 'username required' },
        { status: 400 }
      )
    }

    const user = store.addUser(username)
    store.addSystemMessage(`${username} joined the chat`)

    return NextResponse.json({
      success: true,
      data: {
        user,
        users: store.getOnlineUsers(),
        messages: store.getMessages()
      }
    })
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON' },
      { status: 400 }
    )
  }
}
