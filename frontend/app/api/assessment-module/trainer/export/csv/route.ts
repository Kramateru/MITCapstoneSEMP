import { requireBackendSessionUser } from '@/app/lib/assessment/backend-auth'
import { handleAssessmentRouteError } from '@/app/lib/assessment/route-utils'
import { getTrainerAssessmentCsvExport } from '@/app/lib/assessment/module-service'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  try {
    const sessionUser = await requireBackendSessionUser(request, ['admin', 'trainer'])
    const exportPayload = await getTrainerAssessmentCsvExport(sessionUser)

    return new Response(exportPayload.content, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${exportPayload.filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    return handleAssessmentRouteError(error)
  }
}
