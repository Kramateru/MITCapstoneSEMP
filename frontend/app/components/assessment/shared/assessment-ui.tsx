'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'

import { Button } from '@/app/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card'

export function formatDateLabel(value?: string | null) {
  if (!value) {
    return 'No date'
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return 'No date'
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(parsed)
}

export function formatDateTimeLabel(value?: string | null) {
  if (!value) {
    return 'No timestamp'
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return 'No timestamp'
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(parsed)
}

export function formatDurationLabel(value?: number | null) {
  const totalSeconds = Math.max(Number(value || 0), 0)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`
  }

  return `${seconds}s`
}

export function getAttemptTone(status?: 'pass' | 'fail') {
  if (status === 'pass') {
    return 'bg-emerald-100 text-emerald-700 border-emerald-200'
  }
  if (status === 'fail') {
    return 'bg-amber-100 text-amber-700 border-amber-200'
  }
  return 'bg-slate-100 text-slate-700 border-slate-200'
}

export function MetricCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string
  value: string
  hint?: string
  icon?: ReactNode
}) {
  return (
    <Card className="overflow-hidden border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.96))] shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-3 text-sm text-slate-600">
          <span className="inline-flex size-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm">
            {icon}
          </span>
          <span>{label}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="text-3xl font-bold tracking-tight text-slate-950">{value}</div>
        {hint ? <div className="mt-2 text-xs uppercase tracking-[0.16em] text-slate-500">{hint}</div> : null}
      </CardContent>
    </Card>
  )
}

export function EmptyState({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <Card className="border-dashed border-slate-300 bg-[linear-gradient(135deg,rgba(248,250,252,0.95),rgba(255,255,255,0.98))]">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
    </Card>
  )
}

export function AssessmentWorkspaceHero({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string
  title: string
  description: string
  actions?: ReactNode
}) {
  return (
    <Card className="overflow-hidden border-slate-200 bg-[radial-gradient(circle_at_top_left,rgba(186,230,253,0.55),transparent_35%),linear-gradient(135deg,rgba(255,255,255,0.98),rgba(241,245,249,0.98))] shadow-sm">
      <CardContent className="flex flex-col gap-6 p-6 xl:flex-row xl:items-end xl:justify-between">
        <div className="space-y-3">
          <div className="text-xs font-semibold uppercase tracking-[0.26em] text-sky-700">{eyebrow}</div>
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight text-slate-950 xl:text-4xl">{title}</h1>
            <p className="max-w-3xl text-sm leading-7 text-slate-600">{description}</p>
          </div>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
      </CardContent>
    </Card>
  )
}

export function AssessmentSectionNav<TSection extends string>({
  activeSection,
  sections,
  onSelect,
}: {
  activeSection: TSection
  sections: Array<{
    id: TSection
    label: string
    description: string
    icon: ReactNode
  }>
  onSelect: (section: TSection) => void
}) {
  const currentSection = sections.find((section) => section.id === activeSection) || sections[0]

  return (
    <Card className="border-slate-200 bg-white/95 shadow-sm">
      <CardContent className="space-y-3 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <div className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-slate-500">Workspace Navigation</div>
            <div className="text-sm text-slate-600">Jump between the core workflow cards on this one-page assessment workspace.</div>
          </div>
          <div className="inline-flex items-center self-start rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-500">
            {sections.length} Sections
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {sections.map((section) => {
            const isActive = section.id === activeSection
            return (
              <button
                key={section.id}
                type="button"
                onClick={() => onSelect(section.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`group inline-flex min-h-11 max-w-full items-center gap-2 rounded-full border px-3 py-2 text-left transition ${
                  isActive
                    ? 'border-sky-200 bg-sky-50 text-slate-950 shadow-sm shadow-sky-100'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`inline-flex size-8 shrink-0 items-center justify-center rounded-full border transition ${
                      isActive
                        ? 'border-sky-200 bg-white text-sky-700'
                        : 'border-slate-200 bg-slate-50 text-slate-600 group-hover:border-slate-300 group-hover:bg-white'
                    }`}
                  >
                    {section.icon}
                  </span>
                  <span className={`min-w-0 text-sm font-semibold ${isActive ? 'text-slate-950' : 'text-slate-800'}`}>
                    {section.label}
                  </span>
                </div>
              </button>
            )
          })}
        </div>
        {currentSection ? (
          <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-[linear-gradient(180deg,rgba(248,250,252,0.95),rgba(255,255,255,0.98))] px-3.5 py-3">
            <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-sky-200 bg-white text-sky-700">
              {currentSection.icon}
            </span>
            <div className="min-w-0">
              <div className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-500">Current Section</div>
              <div className="mt-1 text-sm font-semibold text-slate-950">{currentSection.label}</div>
              <div className="mt-1 text-xs leading-5 text-slate-600">{currentSection.description}</div>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

export function PaginationBar({
  currentPage,
  totalPages,
  itemCountLabel,
  onPrevious,
  onNext,
}: {
  currentPage: number
  totalPages: number
  itemCountLabel: string
  onPrevious: () => void
  onNext: () => void
}) {
  if (totalPages <= 1) {
    return null
  }

  return (
    <div className="flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-sm text-slate-500">{itemCountLabel}</div>
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" onClick={onPrevious} disabled={currentPage <= 1}>
          <ChevronLeft className="size-4" />
          Previous
        </Button>
        <div className="inline-flex items-center rounded-xl border border-slate-200 px-3 text-sm text-slate-600">
          Page {currentPage} of {totalPages}
        </div>
        <Button type="button" variant="outline" onClick={onNext} disabled={currentPage >= totalPages}>
          Next
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  )
}
