import { proxyRequestToBackend } from '@/app/lib/backend-proxy'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function forward(request: Request) {
  return proxyRequestToBackend(request, {
    unavailableMessage:
      'Unable to reach the Call Simulation service. Start the backend server and try again.',
  })
}

export async function GET(request: Request) {
  return forward(request)
}

export async function POST(request: Request) {
  return forward(request)
}

export async function PUT(request: Request) {
  return forward(request)
}

export async function PATCH(request: Request) {
  return forward(request)
}

export async function DELETE(request: Request) {
  return forward(request)
}
