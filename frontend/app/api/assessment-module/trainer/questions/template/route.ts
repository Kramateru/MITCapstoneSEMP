import { getAssessmentCsvTemplate } from '@/app/lib/assessment/backend-module-service'

export const runtime = 'nodejs'

export async function GET() {
  const csv = await getAssessmentCsvTemplate()

  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="assessment-question-template.csv"',
      'Cache-Control': 'no-store',
    },
  })
}
