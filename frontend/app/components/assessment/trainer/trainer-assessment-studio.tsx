'use client'

import { Activity, BookOpenCheck, ClipboardList, Loader2, RefreshCw, Trophy } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'

import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card'
import { Button } from '@/app/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/app/components/ui/tabs'
import { fetchTrainerAssessmentBootstrap, openTrainerAssessmentStream } from '@/app/lib/assessment/client'
import type { TrainerBootstrapResponse } from '@/app/lib/assessment/types'

import { TrainerAssignmentPanel } from './trainer-assignment-panel'
import { TrainerBuilderPanel } from './trainer-builder-panel'
import { TrainerLiveAnalyticsPanel } from './trainer-live-analytics-panel'

export function TrainerAssessmentStudio() {
  const [workspace, setWorkspace] = useState<TrainerBootstrapResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [liveStatus, setLiveStatus] = useState('Connecting trainer analytics...')

  const refreshWorkspace = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    try {
      if (mode === 'initial') {
        setLoading(true)
      } else {
        setRefreshing(true)
      }
      setError('')
      const payload = await fetchTrainerAssessmentBootstrap()
      setWorkspace(payload)
    } catch (loadError) {
      console.error(loadError)
      setError(loadError instanceof Error ? loadError.message : 'Unable to load the assessment workspace.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void refreshWorkspace()
  }, [refreshWorkspace])

  useEffect(() => {
    if (!workspace) {
      return
    }

    let stream: EventSource | null = null
    try {
      stream = openTrainerAssessmentStream()
      stream.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data) as { type?: string; status?: string }
          if (payload.type === 'status' && payload.status) {
            setLiveStatus(`Supabase realtime: ${payload.status.toLowerCase().replace(/_/g, ' ')}`)
            return
          }
          if (payload.type === 'attempt_changed' || payload.type === 'coaching_changed') {
            setLiveStatus('Supabase realtime update received. Refreshing analytics...')
            void refreshWorkspace('refresh')
          }
        } catch {
          setLiveStatus('Live analytics event received.')
        }
      }
      stream.onerror = () => {
        setLiveStatus('Realtime stream disconnected. Manual refresh is still available.')
      }
    } catch (streamError) {
      console.error(streamError)
      setLiveStatus('Realtime stream unavailable. Manual refresh is still available.')
    }

    return () => {
      stream?.close()
    }
  }, [refreshWorkspace, workspace])

  if (loading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" />
        Loading assessment studio...
      </div>
    )
  }

  if (!workspace) {
    return (
      <Card className="border-amber-200 bg-amber-50/70">
        <CardHeader className="space-y-3">
          <CardTitle className="text-slate-950">Assessment studio is temporarily unavailable</CardTitle>
          <p className="text-sm text-slate-700">
            The advanced assessment workspace could not load right now. Trainer assessment work can still continue
            from the working tools below while the shared data service is unavailable.
          </p>
          {error ? (
            <div className="rounded-2xl border border-amber-200 bg-white/90 px-4 py-3 text-sm text-amber-900">
              {error}
            </div>
          ) : null}
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button type="button" onClick={() => void refreshWorkspace('refresh')} disabled={refreshing}>
            {refreshing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            Retry
          </Button>
          <Button asChild variant="outline">
            <Link href="/trainer/mcq">Open MCQ Workspace</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/trainer/microlearning">Open Microlearning</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/trainer/grading">Open Grading Review</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-950">Assessment Studio</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            Create categories, build mixed assessments, assign them to batches, and review trainee results from the
            Supabase-backed assessment records.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => void refreshWorkspace('refresh')} disabled={refreshing}>
          {refreshing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          Refresh
        </Button>
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Categories" value={String(workspace.categories.length)} icon={<ClipboardList className="size-4 text-blue-600" />} />
        <MetricCard label="Assessments" value={String(workspace.categories.reduce((sum, category) => sum + category.assessments.length, 0))} icon={<BookOpenCheck className="size-4 text-sky-600" />} />
        <MetricCard label="Live Attempts" value={String(workspace.attempts.length)} icon={<Activity className="size-4 text-amber-600" />} />
        <MetricCard label="Certified Passes" value={String(workspace.attempts.filter((attempt) => attempt.certificateCode).length)} icon={<Trophy className="size-4 text-emerald-600" />} />
      </div>

      <Tabs defaultValue="builder" className="space-y-6">
        <TabsList className="grid w-full max-w-3xl grid-cols-3">
          <TabsTrigger value="builder">Builder</TabsTrigger>
          <TabsTrigger value="assignments">Assignments</TabsTrigger>
          <TabsTrigger value="analytics">Live Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="builder">
          <TrainerBuilderPanel workspace={workspace} onRefresh={() => refreshWorkspace('refresh')} />
        </TabsContent>

        <TabsContent value="assignments">
          <TrainerAssignmentPanel workspace={workspace} onRefresh={() => refreshWorkspace('refresh')} />
        </TabsContent>

        <TabsContent value="analytics">
          <TrainerLiveAnalyticsPanel
            workspace={workspace}
            liveStatus={liveStatus}
            onRefresh={() => refreshWorkspace('refresh')}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function MetricCard({
  label,
  value,
  icon,
}: {
  label: string
  value: string
  icon: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm text-slate-600">
          {icon}
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold text-slate-950">{value}</div>
      </CardContent>
    </Card>
  )
}
