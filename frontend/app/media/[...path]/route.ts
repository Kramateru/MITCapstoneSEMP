import { proxyRequestToBackend } from '@/app/lib/backend-proxy'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  return proxyRequestToBackend(request)
}

export async function HEAD(request: Request) {
  return proxyRequestToBackend(request)
}
