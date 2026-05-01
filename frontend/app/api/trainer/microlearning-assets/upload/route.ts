import { proxyRequestToBackend } from '@/app/lib/backend-proxy'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  return proxyRequestToBackend(request)
}
