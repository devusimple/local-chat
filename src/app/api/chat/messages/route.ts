import { NextResponse } from 'next/server'
import { store } from '@/lib/chat-store'

export async function GET() {
  return NextResponse.json({
    success: true,
    data: store.getMessages(),
    count: store.getMessages().length
  })
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { username, content, color } = body

    if (!username || !content) {
      return NextResponse.json(
        { success: false, error: 'username and content required' },
        { status: 400 }
      )
    }

    const user = Array.from(store.users.values()).find(u => u.username === username)
    const messageColor = color || user?.color || store.addUser(username).color

    const message = store.addMessage(username, content, messageColor)

    return NextResponse.json({ success: true, data: message })
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON' },
      { status: 400 }
    )
  }
}
