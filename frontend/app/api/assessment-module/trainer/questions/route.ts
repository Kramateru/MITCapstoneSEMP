import { proxyRequestToBackend } from '@/app/lib/backend-proxy'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  return proxyRequestToBackend(request)
}

export async function POST(request: Request) {
  return proxyRequestToBackend(request)
}
