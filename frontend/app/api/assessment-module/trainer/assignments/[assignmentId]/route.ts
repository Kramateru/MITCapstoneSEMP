import { proxyRequestToBackend } from '@/app/lib/backend-proxy'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  return proxyRequestToBackend(request)
}

export async function PATCH(request: Request) {
  return proxyRequestToBackend(request)
}

export async function PUT(request: Request) {
  return proxyRequestToBackend(request)
}

export async function DELETE(request: Request) {
  return proxyRequestToBackend(request)
}
