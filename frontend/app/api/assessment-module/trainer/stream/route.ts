import { createSupabaseAdminClient } from '@/app/lib/assessment/supabase-admin'
import { requireBackendSessionUser } from '@/app/lib/assessment/backend-auth'
import { handleAssessmentRouteError, withAssessmentRequestContext } from '@/app/lib/assessment/route-utils'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RealtimeRecord = {
  id?: string
  created_by?: string | null
  assigned_by?: string | null
  trainer_id?: string | null
  category_id?: string | null
}

function getRealtimeRecord(payload: {
  new?: Record<string, unknown> | null
  old?: Record<string, unknown> | null
}) {
  return ((payload.new || payload.old || null) as RealtimeRecord | null)
}

async function loadOwnedCategoryIds(trainerId: string) {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('training_assessment_categories')
    .select('id')
    .eq('created_by', trainerId)
    .eq('active_status', true)

  if (error) {
    throw error
  }

  return new Set(
    (data || [])
      .map((row) => row.id)
      .filter((value): value is string => typeof value === 'string' && value.length > 0),
  )
}

export async function GET(request: Request) {
  return withAssessmentRequestContext(request, async () => {
    try {
      const sessionUser = await requireBackendSessionUser(request, ['admin', 'trainer'])
      const supabase = createSupabaseAdminClient()
      const ownedCategoryIds = sessionUser.role === 'admin'
        ? null
        : await loadOwnedCategoryIds(sessionUser.userId)

      const stream = new TransformStream()
      const writer = stream.writable.getWriter()
      const encoder = new TextEncoder()

      const sendEvent = async (payload: Record<string, unknown>) => {
        await writer.write(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`))
      }

      const isOwnedCategory = (categoryId: string | null | undefined) => {
        if (sessionUser.role === 'admin') {
          return true
        }

        return !!categoryId && !!ownedCategoryIds?.has(categoryId)
      }

      const matchesTrainerScope = (record: RealtimeRecord | null) => {
        if (!record) {
          return false
        }

        if (sessionUser.role === 'admin') {
          return true
        }

        if (record.created_by === sessionUser.userId) {
          return true
        }

        if (record.assigned_by === sessionUser.userId) {
          return true
        }

        if (record.trainer_id === sessionUser.userId) {
          return true
        }

        return isOwnedCategory(record.category_id)
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
        .channel(`training-assessment-trainer-stream-${sessionUser.userId}-${Date.now()}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'training_assessment_categories' },
          async (payload) => {
            const record = getRealtimeRecord(payload)
            if (!matchesTrainerScope(record)) {
              return
            }

            await sendEvent({
              type: 'category_changed',
              table: 'training_assessment_categories',
              recordId: record?.id || null,
            })
          },
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'training_assessment_questions' },
          async (payload) => {
            const record = getRealtimeRecord(payload)
            if (!matchesTrainerScope(record)) {
              return
            }

            await sendEvent({
              type: 'question_changed',
              table: 'training_assessment_questions',
              recordId: record?.id || null,
            })
          },
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'training_assessment_assignments' },
          async (payload) => {
            const record = getRealtimeRecord(payload)
            if (!matchesTrainerScope(record)) {
              return
            }

            await sendEvent({
              type: 'assignment_changed',
              table: 'training_assessment_assignments',
              recordId: record?.id || null,
            })
          },
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'training_assessment_attempts' },
          async (payload) => {
            const record = getRealtimeRecord(payload)
            if (!matchesTrainerScope(record)) {
              return
            }

            await sendEvent({
              type: 'attempt_changed',
              table: 'training_assessment_attempts',
              recordId: record?.id || null,
            })
          },
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'training_assessment_coaching_notes' },
          async (payload) => {
            const record = getRealtimeRecord(payload)
            if (!matchesTrainerScope(record)) {
              return
            }

            await sendEvent({
              type: 'coaching_changed',
              table: 'training_assessment_coaching_notes',
              recordId: record?.id || null,
            })
          },
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'training_assessment_certificates' },
          async (payload) => {
            const record = getRealtimeRecord(payload)
            if (!matchesTrainerScope(record)) {
              return
            }

            await sendEvent({
              type: 'certificate_changed',
              table: 'training_assessment_certificates',
              recordId: record?.id || null,
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
  })
}
