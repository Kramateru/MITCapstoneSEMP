'use client';

import { DashboardLayout } from '@/app/components/DashboardLayout';
import { Card, CardContent } from '@/app/components/ui/card';
import { LazyIcon } from '@/app/components/ui/LazyIcon';
import { Suspense } from 'react';
import CallSimulator from './call-simulator';

const Loader2 = (props: any) => <LazyIcon name="Loader2" {...props} />;

function TraineeCallSimulationFallback() {
  return (
    <DashboardLayout title="Call Simulation" description="Practice your call handling with AI-powered scenarios">
      <Card>
        <CardContent className="flex items-center justify-center gap-3 p-8">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading call scenarios...</span>
        </CardContent>
      </Card>
    </DashboardLayout>
  );
}

function TraineeCallSimulationContent() {
  return (
    <DashboardLayout title="Call Simulation" description="Practice your call handling with AI-powered scenarios">
      <CallSimulator />
    </DashboardLayout>
  );
}

export default function TraineeCallSimulationPage() {
  return (
    <Suspense fallback={<TraineeCallSimulationFallback />}>
      <TraineeCallSimulationContent />
    </Suspense>
  );
}
