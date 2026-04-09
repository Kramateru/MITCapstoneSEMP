import { createSupabaseAdminClient } from '@/app/lib/assessment/supabase-admin'
import { requireBackendSessionUser } from '@/app/lib/assessment/backend-auth'
import { handleAssessmentRouteError } from '@/app/lib/assessment/route-utils'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RealtimeRecord = {
  id?: string
  trainee_id?: string | null
  batch_id?: string | null
}

function getRealtimeRecord(payload: {
  new?: Record<string, unknown> | null
  old?: Record<string, unknown> | null
}) {
  return ((payload.new || payload.old || null) as RealtimeRecord | null)
}

export async function GET(request: Request) {
  try {
    const sessionUser = await requireBackendSessionUser(request, ['trainee'])
    const supabase = createSupabaseAdminClient()

    const { data: batchMemberships, error: batchError } = await supabase
      .from('batch_user')
      .select('batch_id')
      .eq('user_id', sessionUser.userId)

    if (batchError) {
      throw batchError
    }

    const batchIds = new Set(
      (batchMemberships || [])
        .map((membership) => membership.batch_id)
        .filter((value): value is string => typeof value === 'string' && value.length > 0),
    )

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
        // Ignore close errors after the client disconnects.
      }
    }

    const channel = supabase
      .channel(`training-assessment-trainee-stream-${sessionUser.userId}-${Date.now()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'training_assessment_assignments' },
        async (payload) => {
          const record = getRealtimeRecord(payload)
          if (!record) {
            return
          }

          const matchesTrainee =
            record.trainee_id === sessionUser.userId
            || (!!record.batch_id && batchIds.has(record.batch_id))

          if (!matchesTrainee) {
            return
          }

          await sendEvent({
            type: 'assignment_changed',
            table: 'training_assessment_assignments',
            recordId: record.id || null,
          })
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'training_assessment_attempts' },
        async (payload) => {
          const record = getRealtimeRecord(payload)
          if (!record || record.trainee_id !== sessionUser.userId) {
            return
          }

          await sendEvent({
            type: 'attempt_changed',
            table: 'training_assessment_attempts',
            recordId: record.id || null,
          })
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'training_assessment_coaching_notes' },
        async (payload) => {
          const record = getRealtimeRecord(payload)
          if (!record || record.trainee_id !== sessionUser.userId) {
            return
          }

          await sendEvent({
            type: 'coaching_changed',
            table: 'training_assessment_coaching_notes',
            recordId: record.id || null,
          })
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'training_assessment_certificates' },
        async (payload) => {
          const record = getRealtimeRecord(payload)
          if (!record || record.trainee_id !== sessionUser.userId) {
            return
          }

          await sendEvent({
            type: 'certificate_changed',
            table: 'training_assessment_certificates',
            recordId: record.id || null,
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
      traineeId: sessionUser.userId,
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
