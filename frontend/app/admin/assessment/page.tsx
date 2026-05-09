'use client'

import { DashboardLayout } from '@/app/components/DashboardLayout'
import { TrainerAssessmentStudio } from '@/app/components/assessment/trainer/trainer-assessment-studio'
import { adminSidebarItems } from '@/app/admin/nav'

export default function AdminAssessmentPage() {
  return (
    <DashboardLayout sidebarItems={adminSidebarItems} userRole="admin">
      <TrainerAssessmentStudio role="admin" />
    </DashboardLayout>
  )
}
