'use client'

import { BarChart3, CheckCircle2, Download, MessageSquarePlus, Printer } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import { Badge } from '@/app/components/ui/badge'
import { Button } from '@/app/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/app/components/ui/dialog'
import { Input } from '@/app/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/app/components/ui/select'
import { Textarea } from '@/app/components/ui/textarea'
import { coachAssessmentAttemptRequest, downloadTrainerAssessmentCsv } from '@/app/lib/assessment/client'
import type { AttemptRecord, TrainerBootstrapResponse } from '@/app/lib/assessment/types'

const ATTEMPTS_PER_PAGE = 6

export function TrainerLiveAnalyticsPanel({
  workspace,
  liveStatus,
  onRefresh,
}: {
  workspace: TrainerBootstrapResponse
  liveStatus: string
  onRefresh: () => Promise<void>
}) {
  const [coachingTarget, setCoachingTarget] = useState<AttemptRecord | null>(null)
  const [coachingDraft, setCoachingDraft] = useState({
    feedback: '',
    trainerNote: '',
    actionItems: '',
  })
  const [attemptSearch, setAttemptSearch] = useState('')
  const [attemptStatusFilter, setAttemptStatusFilter] = useState<'all' | 'pass' | 'fail'>('all')
  const [attemptPage, setAttemptPage] = useState(1)

  const attempts = workspace.attempts
  const weakQuestions = workspace.reports.questions.slice(0, 5)

  const filteredAttempts = useMemo(() => {
    const normalizedSearch = attemptSearch.trim().toLowerCase()

    return attempts.filter((attempt) => {
      if (attemptStatusFilter !== 'all' && attempt.status !== attemptStatusFilter) {
        return false
      }

      if (!normalizedSearch) {
        return true
      }

      const haystack = [
        attempt.traineeName,
        attempt.traineeEmail || '',
        attempt.categoryTitle,
        attempt.assessmentTitle,
        attempt.batchName || '',
        attempt.certificateCode || '',
      ]
        .join(' ')
        .toLowerCase()

      return haystack.includes(normalizedSearch)
    })
  }, [attemptSearch, attemptStatusFilter, attempts])

  const attemptPageCount = Math.max(1, Math.ceil(filteredAttempts.length / ATTEMPTS_PER_PAGE))
  const visibleAttempts = useMemo(() => {
    const currentPage = Math.min(attemptPage, attemptPageCount)
    const startIndex = (currentPage - 1) * ATTEMPTS_PER_PAGE
    return filteredAttempts.slice(startIndex, startIndex + ATTEMPTS_PER_PAGE)
  }, [attemptPage, attemptPageCount, filteredAttempts])

  useEffect(() => {
    setAttemptPage(1)
  }, [attemptSearch, attemptStatusFilter])

  useEffect(() => {
    if (attemptPage > attemptPageCount) {
      setAttemptPage(attemptPageCount)
    }
  }, [attemptPage, attemptPageCount])

  const handleCoachAttempt = async () => {
    if (!coachingTarget || !coachingDraft.feedback.trim()) {
      toast.error('Coaching feedback is required.')
      return
    }

    await coachAssessmentAttemptRequest({
      attemptId: coachingTarget.id,
      feedback: coachingDraft.feedback,
      trainerNote: coachingDraft.trainerNote,
      actionItems: coachingDraft.actionItems,
      visibility: 'shared',
    })

    toast.success('Coaching note saved.')
    setCoachingTarget(null)
    setCoachingDraft({ feedback: '', trainerNote: '', actionItems: '' })
    await onRefresh()
  }

  const handleExportCsv = async () => {
    try {
      await downloadTrainerAssessmentCsv()
      toast.success('Assessment report exported as CSV.')
    } catch (error) {
      console.error(error)
      toast.error(error instanceof Error ? error.message : 'Unable to export the assessment report.')
    }
  }

  const handlePrintReport = () => {
    const printWindow = window.open('', '_blank', 'noopener,noreferrer')
    if (!printWindow) {
      toast.error('Allow pop-ups in your browser to print or save the report as PDF.')
      return
    }

    printWindow.document.write(buildPrintableReportMarkup(workspace))
    printWindow.document.close()
    printWindow.focus()
    printWindow.print()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
          {liveStatus}
        </div>
        <div className="flex flex-wrap gap-3">
          <Button type="button" variant="outline" onClick={() => void handleExportCsv()}>
            <Download className="size-4" />
            Export CSV
          </Button>
          <Button type="button" variant="outline" onClick={handlePrintReport}>
            <Printer className="size-4" />
            Print / Save PDF
          </Button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.15fr,0.85fr]">
        <Card>
          <CardHeader className="space-y-4">
            <div>
              <CardTitle>Recent Trainee Attempts</CardTitle>
              <CardDescription>Live attempts update here through the Supabase Realtime stream.</CardDescription>
            </div>
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
              <Input
                value={attemptSearch}
                onChange={(event) => setAttemptSearch(event.target.value)}
                placeholder="Search trainee, assessment, batch, or certificate"
              />
              <Select
                value={attemptStatusFilter}
                onValueChange={(value: 'all' | 'pass' | 'fail') => setAttemptStatusFilter(value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="pass">Pass only</SelectItem>
                  <SelectItem value="fail">Fail only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {visibleAttempts.map((attempt) => (
              <div key={attempt.id} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="font-semibold text-slate-900">{attempt.traineeName}</div>
                    <div className="mt-1 text-sm text-slate-600">
                      {attempt.categoryTitle} | {attempt.assessmentTitle}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      Attempt {attempt.attemptNo} | {new Date(attempt.submittedAt).toLocaleString()}
                    </div>
                    {attempt.batchName ? (
                      <div className="mt-1 text-xs text-slate-500">Batch: {attempt.batchName}</div>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      className={
                        attempt.status === 'pass'
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-amber-100 text-amber-700'
                      }
                    >
                      {attempt.status === 'pass' ? 'Pass' : 'Fail'}
                    </Badge>
                    <Badge variant="outline">{attempt.score.toFixed(1)}%</Badge>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setCoachingTarget(attempt)
                        setCoachingDraft({
                          feedback: attempt.feedback || '',
                          trainerNote: attempt.trainerNote || '',
                          actionItems: '',
                        })
                      }}
                    >
                      <MessageSquarePlus className="size-4" />
                      Coach
                    </Button>
                  </div>
                </div>
              </div>
            ))}

            {!visibleAttempts.length ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-600">
                No attempts match the current filters yet.
              </div>
            ) : null}

            {filteredAttempts.length > ATTEMPTS_PER_PAGE ? (
              <div className="flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm text-slate-500">
                  Showing {visibleAttempts.length} of {filteredAttempts.length} attempts
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={attemptPage <= 1}
                    onClick={() => setAttemptPage((current) => Math.max(1, current - 1))}
                  >
                    Previous
                  </Button>
                  <div className="inline-flex items-center rounded-xl border border-slate-200 px-3 text-sm text-slate-600">
                    Page {Math.min(attemptPage, attemptPageCount)} of {attemptPageCount}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={attemptPage >= attemptPageCount}
                    onClick={() => setAttemptPage((current) => Math.min(attemptPageCount, current + 1))}
                  >
                    Next
                  </Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Pass / Fail by Category</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {workspace.reports.categories.map((report) => (
                <div key={report.categoryId} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-semibold text-slate-900">{report.categoryTitle}</div>
                    <Badge variant="outline">{report.passRate.toFixed(1)}% pass rate</Badge>
                  </div>
                  <div className="mt-2 text-sm text-slate-600">
                    {report.passCount} pass | {report.failCount} fail | Avg {report.averageScore.toFixed(1)}%
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Weak Areas per Question</CardTitle>
              <CardDescription>Highest miss-rate questions are surfaced for targeted coaching.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {weakQuestions.map((question) => (
                <div key={question.questionId} className="rounded-2xl border border-slate-200 p-4">
                  <div className="font-medium text-slate-900">{question.questionText}</div>
                  <div className="mt-2 text-xs text-slate-500">
                    {question.incorrectCount} misses out of {question.answerCount} answers
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-sm text-amber-700">
                    <BarChart3 className="size-4" />
                    Miss rate {question.missRate.toFixed(1)}%
                  </div>
                </div>
              ))}
              {!weakQuestions.length ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-600">
                  Question analytics will appear after trainees submit attempts.
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={!!coachingTarget} onOpenChange={(open) => !open && setCoachingTarget(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Coach Attempt</DialogTitle>
            <DialogDescription>
              Add manual notes for {coachingTarget?.traineeName}. The note appears on the trainee progress page immediately.
            </DialogDescription>
          </DialogHeader>

          {coachingTarget ? (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                <InfoTile label="Trainee" value={coachingTarget.traineeName} />
                <InfoTile label="Score" value={`${coachingTarget.score.toFixed(1)}%`} />
                <InfoTile label="Status" value={coachingTarget.status.toUpperCase()} />
              </div>
              <Textarea
                value={coachingDraft.feedback}
                onChange={(event) =>
                  setCoachingDraft((current) => ({ ...current, feedback: event.target.value }))
                }
                rows={4}
                placeholder="What should the trainee keep doing or improve next?"
              />
              <Textarea
                value={coachingDraft.trainerNote}
                onChange={(event) =>
                  setCoachingDraft((current) => ({ ...current, trainerNote: event.target.value }))
                }
                rows={3}
                placeholder="Internal trainer note"
              />
              <Textarea
                value={coachingDraft.actionItems}
                onChange={(event) =>
                  setCoachingDraft((current) => ({ ...current, actionItems: event.target.value }))
                }
                rows={3}
                placeholder="Action items"
              />
              <div className="flex justify-end gap-3">
                <Button type="button" variant="outline" onClick={() => setCoachingTarget(null)}>
                  Cancel
                </Button>
                <Button type="button" onClick={() => void handleCoachAttempt()}>
                  <CheckCircle2 className="size-4" />
                  Save Coaching Note
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function buildPrintableReportMarkup(workspace: TrainerBootstrapResponse) {
  const categoryCards = workspace.reports.categories
    .map((report) => `
      <div class="summary-card">
        <div class="summary-label">${escapeHtml(report.categoryTitle)}</div>
        <div class="summary-value">${report.passRate.toFixed(1)}% pass rate</div>
        <div class="summary-meta">${report.passCount} pass | ${report.failCount} fail | Avg ${report.averageScore.toFixed(1)}%</div>
      </div>
    `)
    .join('')

  const attemptRows = workspace.attempts
    .slice(0, 20)
    .map((attempt) => `
      <tr>
        <td>${escapeHtml(attempt.traineeName)}</td>
        <td>${escapeHtml(attempt.categoryTitle)}</td>
        <td>${escapeHtml(attempt.assessmentTitle)}</td>
        <td>${attempt.attemptNo}</td>
        <td>${attempt.score.toFixed(2)}%</td>
        <td>${escapeHtml(attempt.status.toUpperCase())}</td>
        <td>${escapeHtml(attempt.batchName || 'Direct assignment')}</td>
        <td>${escapeHtml(new Date(attempt.submittedAt).toLocaleString())}</td>
      </tr>
    `)
    .join('')

  const weakAreaRows = workspace.reports.questions
    .slice(0, 8)
    .map((question) => `
      <tr>
        <td>${escapeHtml(question.questionText)}</td>
        <td>${escapeHtml(question.questionType.replace(/_/g, ' '))}</td>
        <td>${question.answerCount}</td>
        <td>${question.incorrectCount}</td>
        <td>${question.missRate.toFixed(1)}%</td>
      </tr>
    `)
    .join('')

  return `<!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <title>Assessment Analytics Report</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          margin: 32px;
          color: #0f172a;
          background: #ffffff;
        }
        h1, h2 {
          margin: 0 0 12px;
        }
        p {
          margin: 0;
          color: #475569;
        }
        .header {
          margin-bottom: 28px;
        }
        .summary-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
          margin: 20px 0 28px;
        }
        .summary-card {
          border: 1px solid #cbd5e1;
          border-radius: 16px;
          padding: 16px;
          background: #f8fafc;
        }
        .summary-label {
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          color: #64748b;
        }
        .summary-value {
          margin-top: 8px;
          font-size: 20px;
          font-weight: 700;
          color: #0f172a;
        }
        .summary-meta {
          margin-top: 6px;
          font-size: 13px;
          color: #475569;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 14px;
        }
        th, td {
          border: 1px solid #cbd5e1;
          padding: 10px 12px;
          text-align: left;
          font-size: 13px;
          vertical-align: top;
        }
        th {
          background: #e2e8f0;
          font-weight: 700;
        }
        section {
          margin-top: 32px;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Assessment Analytics Report</h1>
        <p>Generated ${escapeHtml(new Date().toLocaleString())}</p>
      </div>

      <div class="summary-grid">
        <div class="summary-card">
          <div class="summary-label">Categories</div>
          <div class="summary-value">${workspace.categories.length}</div>
          <div class="summary-meta">Assessment categories currently managed</div>
        </div>
        <div class="summary-card">
          <div class="summary-label">Attempts</div>
          <div class="summary-value">${workspace.attempts.length}</div>
          <div class="summary-meta">Recorded trainee attempts</div>
        </div>
        <div class="summary-card">
          <div class="summary-label">Certificates</div>
          <div class="summary-value">${workspace.attempts.filter((attempt) => attempt.certificateCode).length}</div>
          <div class="summary-meta">Passing outcomes with certificate issuance</div>
        </div>
      </div>

      <section>
        <h2>Category Summary</h2>
        <div class="summary-grid">${categoryCards || '<div class="summary-card">No category analytics yet.</div>'}</div>
      </section>

      <section>
        <h2>Recent Attempts</h2>
        <table>
          <thead>
            <tr>
              <th>Trainee</th>
              <th>Category</th>
              <th>Assessment</th>
              <th>Attempt</th>
              <th>Score</th>
              <th>Status</th>
              <th>Batch</th>
              <th>Submitted</th>
            </tr>
          </thead>
          <tbody>
            ${attemptRows || '<tr><td colspan="8">No attempts recorded yet.</td></tr>'}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Weak Areas by Question</h2>
        <table>
          <thead>
            <tr>
              <th>Question</th>
              <th>Type</th>
              <th>Answers</th>
              <th>Misses</th>
              <th>Miss Rate</th>
            </tr>
          </thead>
          <tbody>
            ${weakAreaRows || '<tr><td colspan="5">No question analytics available yet.</td></tr>'}
          </tbody>
        </table>
      </section>
    </body>
  </html>`
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="text-xs uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className="mt-2 text-lg font-semibold text-slate-950">{value}</div>
    </div>
  )
}
