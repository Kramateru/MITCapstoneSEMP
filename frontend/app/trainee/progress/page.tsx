'use client'

import { DashboardLayout } from '@/app/components/DashboardLayout'
import ProgressTracking from '@/app/components/trainee/progress-tracking'
import { useAuth } from '@/app/context/AuthContext'
import { traineeSidebarItems } from '@/app/trainee/nav'

export default function TraineeProgressPage() {
  const { user } = useAuth()

  return (
    <DashboardLayout sidebarItems={traineeSidebarItems} userRole="trainee">
      {user ? (
        <ProgressTracking
          user={{
            user_id: user.user_id,
            user_name: user.user_name,
            email: user.email,
            user_role: user.user_role,
          }}
        />
      ) : (
        <div className="flex min-h-[320px] items-center justify-center text-sm text-muted-foreground">
          Loading progress analytics...
        </div>
      )}
    </DashboardLayout>
  )
}
