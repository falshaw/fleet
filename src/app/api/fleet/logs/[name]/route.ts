import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { fleetClient } from '@/lib/fleet-client'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { name } = await params
  const url = new URL(_request.url)
  const lines = Math.min(parseInt(url.searchParams.get('lines') || '50'), 500)

  try {
    const data = await fleetClient.getContainerLogs(name, lines)
    return NextResponse.json(data)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch logs' },
      { status: 502 }
    )
  }
}
