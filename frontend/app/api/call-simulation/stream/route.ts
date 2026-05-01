import { requireBackendSessionUser } from '@/app/lib/assessment/backend-auth'
import { handleAssessmentRouteError } from '@/app/lib/assessment/route-utils'
import { createSupabaseAdminClient } from '@/app/lib/assessment/supabase-admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const sessionUser = await requireBackendSessionUser(request, ['trainee', 'trainer', 'admin'])
    const supabase = createSupabaseAdminClient()
    const requestUrl = new URL(request.url)
    const batchId = requestUrl.searchParams.get('batchId')?.trim() || ''

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
      .channel(`call-simulation-stream-${sessionUser.userId}-${Date.now()}`)
    if (sessionUser.role === 'trainee') {
      const traineeFilter = `trainee_id=eq.${sessionUser.userId}`
      channel
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'sim_session', filter: traineeFilter },
          async (payload) => {
            await sendEvent({
              type: 'session_changed',
              table: 'sim_session',
              recordId:
                (payload.new as { id?: string } | null)?.id ||
                (payload.old as { id?: string } | null)?.id,
            })
          },
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'call_simulation_assignment', filter: traineeFilter },
          async (payload) => {
            await sendEvent({
              type: 'assignment_changed',
              table: 'call_simulation_assignment',
              recordId:
                (payload.new as { id?: string } | null)?.id ||
                (payload.old as { id?: string } | null)?.id,
            })
          },
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'certificate_record', filter: traineeFilter },
          async (payload) => {
            await sendEvent({
              type: 'certificate_changed',
              table: 'certificate_record',
              recordId:
                (payload.new as { id?: string } | null)?.id ||
                (payload.old as { id?: string } | null)?.id,
            })
          },
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'coaching_log', filter: traineeFilter },
          async (payload) => {
            await sendEvent({
              type: 'coaching_changed',
              table: 'coaching_log',
              recordId:
                (payload.new as { id?: string } | null)?.id ||
                (payload.old as { id?: string } | null)?.id,
            })
          },
        )
    } else {
      channel.on(
        'postgres_changes',
        batchId
          ? { event: '*', schema: 'public', table: 'sim_session', filter: `batch_id=eq.${batchId}` }
          : { event: '*', schema: 'public', table: 'sim_session' },
        async (payload) => {
          await sendEvent({
            type: 'session_changed',
            table: 'sim_session',
            recordId:
              (payload.new as { id?: string } | null)?.id ||
              (payload.old as { id?: string } | null)?.id,
          })
        },
      )
      .on(
        'postgres_changes',
        batchId
          ? { event: '*', schema: 'public', table: 'call_simulation_assignment', filter: `batch_id=eq.${batchId}` }
          : { event: '*', schema: 'public', table: 'call_simulation_assignment' },
        async (payload) => {
          await sendEvent({
            type: 'assignment_changed',
            table: 'call_simulation_assignment',
            recordId:
              (payload.new as { id?: string } | null)?.id ||
              (payload.old as { id?: string } | null)?.id,
          })
        },
      )
      .on(
        'postgres_changes',
        sessionUser.role === 'admin'
          ? { event: '*', schema: 'public', table: 'coaching_log' }
          : { event: '*', schema: 'public', table: 'coaching_log', filter: `trainer_id=eq.${sessionUser.userId}` },
        async (payload) => {
          await sendEvent({
            type: 'coaching_changed',
            table: 'coaching_log',
            recordId:
              (payload.new as { id?: string } | null)?.id ||
              (payload.old as { id?: string } | null)?.id,
          })
        },
      )
    }

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
      traineeId: sessionUser.userId,
      batchId: batchId || null,
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
