'use client'

import { DashboardLayout } from '@/app/components/DashboardLayout'
import MCQManager from '@/app/components/shared/mcq-manager'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card'
import { adminSidebarItems } from '@/app/admin/nav'

export default function AdminAssessmentPage() {
  return (
    <DashboardLayout sidebarItems={adminSidebarItems} userRole="admin">
      <div className="space-y-6">
        <Card className="border-sky-200 bg-sky-50/70">
          <CardHeader>
            <CardTitle>Assessment Administration</CardTitle>
            <CardDescription>
              This workspace reads the live MCQ categories and question bank from the backend,
              which is connected directly to Supabase Postgres and Supabase Auth.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-slate-700">
            The previous Next.js assessment studio depended on a separate Supabase REST admin key.
            This admin page now uses the backend-backed path so assessment management stays aligned
            with the active Supabase database connection.
          </CardContent>
        </Card>

        <MCQManager scope="all" />
      </div>
    </DashboardLayout>
  )
}
