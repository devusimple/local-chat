import { NextResponse } from 'next/server'
import { store } from '@/lib/chat-store'

export async function GET() {
  return NextResponse.json({
    success: true,
    data: store.getStats()
  })
}
