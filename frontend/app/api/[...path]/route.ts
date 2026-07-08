import { proxyRequestToBackend } from '@/app/lib/backend-proxy'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  return proxyRequestToBackend(request)
}

export async function POST(request: Request) {
  return proxyRequestToBackend(request)
}

export async function PUT(request: Request) {
  return proxyRequestToBackend(request)
}

export async function PATCH(request: Request) {
  return proxyRequestToBackend(request)
}

export async function DELETE(request: Request) {
  return proxyRequestToBackend(request)
}

export async function OPTIONS(request: Request) {
  return proxyRequestToBackend(request)
}

export async function HEAD(request: Request) {
  return proxyRequestToBackend(request)
}
