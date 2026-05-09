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
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm text-slate-600">
          {icon}
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold text-slate-950">{value}</div>
        {hint ? <div className="mt-1 text-xs text-slate-500">{hint}</div> : null}
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
    <Card className="border-dashed">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
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
  return (
    <div className="grid gap-3 lg:grid-cols-3 xl:grid-cols-5">
      {sections.map((section) => {
        const isActive = section.id === activeSection
        return (
          <button
            key={section.id}
            type="button"
            onClick={() => onSelect(section.id)}
            className={`rounded-3xl border p-4 text-left transition ${
              isActive
                ? 'border-sky-400 bg-sky-50 shadow-sm'
                : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            <div className="flex items-center gap-3 text-slate-900">
              {section.icon}
              <div className="font-semibold">{section.label}</div>
            </div>
            <div className="mt-2 text-xs leading-5 text-slate-500">{section.description}</div>
          </button>
        )
      })}
    </div>
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
