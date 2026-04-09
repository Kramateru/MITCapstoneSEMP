import { createSupabaseAdminClient } from '@/app/lib/assessment/supabase-admin'
import { requireBackendSessionUser } from '@/app/lib/assessment/backend-auth'
import { handleAssessmentRouteError } from '@/app/lib/assessment/route-utils'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const sessionUser = await requireBackendSessionUser(request, ['admin', 'trainer'])
    const supabase = createSupabaseAdminClient()

    const stream = new TransformStream()
    const writer = stream.writable.getWriter()
    const encoder = new TextEncoder()

    const sendEvent = async (payload: Record<string, unknown>) => {
      await writer.write(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`))
    }

    let closed = false
    const closeStream = async () => {
      if (closed) {
        return
      }
      closed = true
      clearInterval(heartbeat)
      await supabase.removeChannel(channel)
      try {
        await writer.close()
      } catch {
        // Ignore close errors when the client is already gone.
      }
    }

    const channel = supabase
      .channel(`training-assessment-stream-${sessionUser.userId}-${Date.now()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'training_assessment_attempts' },
        async (payload) => {
          await sendEvent({
            type: 'attempt_changed',
            table: 'training_assessment_attempts',
            recordId: (payload.new as { id?: string } | null)?.id || (payload.old as { id?: string } | null)?.id,
          })
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'training_assessment_coaching_notes' },
        async (payload) => {
          await sendEvent({
            type: 'coaching_changed',
            table: 'training_assessment_coaching_notes',
            recordId: (payload.new as { id?: string } | null)?.id || (payload.old as { id?: string } | null)?.id,
          })
        },
      )

    channel.subscribe(async (status) => {
      await sendEvent({ type: 'status', status })
    })

    const heartbeat = setInterval(() => {
      void sendEvent({ type: 'heartbeat', at: new Date().toISOString() })
    }, 20000)

    request.signal.addEventListener('abort', () => {
      void closeStream()
    })

    await sendEvent({
      type: 'ready',
      role: sessionUser.role,
      trainerId: sessionUser.userId,
    })

    return new Response(stream.readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    })
  } catch (error) {
    return handleAssessmentRouteError(error)
  }
}
