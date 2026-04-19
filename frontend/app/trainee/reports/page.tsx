'use client';

import { Loader2 } from 'lucide-react';

import { DashboardLayout } from '@/app/components/DashboardLayout';
import ProgressTracking from '@/app/components/trainee/progress-tracking';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { useAuth } from '@/app/context/AuthContext';
import { traineeSidebarItems } from '@/app/trainee/nav';

export default function TraineeReportsPage() {
  const { user } = useAuth();

  return (
    <DashboardLayout sidebarItems={traineeSidebarItems} userRole="trainee">
      {user ? (
        <div className="space-y-6">
          <Card className="border-sky-200 bg-[linear-gradient(135deg,rgba(239,246,255,0.98),rgba(255,255,255,1))]">
            <CardHeader>
              <CardTitle>Trainee Reports</CardTitle>
              <CardDescription>
                Reports now show only the tracked database-backed categories: microlearning, Sim Floor, assessments,
                and coaching. Certificates stay in the separate Certificates navigation.
              </CardDescription>
            </CardHeader>
          </Card>

          <ProgressTracking
            user={{
              user_id: user.user_id,
              user_name: user.user_name,
              email: user.email,
              user_role: user.user_role,
            }}
            title="Reports Overview"
            description="Review your microlearning, Sim Floor, assessment, and coaching analytics from the connected database."
            summaryTitle="Reports Snapshot"
            summaryDescription="Only the tracked report categories are shown here so the reports page matches your actual training records."
          />
        </div>
      ) : (
        <Card>
          <CardContent className="flex min-h-[260px] items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" />
            Loading reports...
          </CardContent>
        </Card>
      )}
    </DashboardLayout>
  );
}
