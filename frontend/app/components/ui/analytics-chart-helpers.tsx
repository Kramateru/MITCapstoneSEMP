'use client'

import { Badge } from './badge'
import { cn } from './utils'

export const ANALYTICS_COLORS = {
  blue: '#1d4ed8',
  teal: '#0f766e',
  emerald: '#059669',
  amber: '#d97706',
  violet: '#7c3aed',
  sky: '#0284c7',
  slate: '#475569',
  rose: '#e11d48',
}

export const SCORE_DISTRIBUTION_COLORS = ['#dbeafe', '#bfdbfe', '#93c5fd', '#60a5fa', '#2563eb']

export const ANALYTICS_TOOLTIP_PROPS = {
  contentStyle: {
    borderRadius: '16px',
    border: '1px solid #cbd5e1',
    backgroundColor: '#ffffff',
    boxShadow: '0 18px 42px -28px rgba(15, 23, 42, 0.45)',
  },
  cursor: {
    fill: 'rgba(148, 163, 184, 0.12)',
  },
  itemStyle: {
    color: '#334155',
    fontSize: '12px',
    paddingTop: '2px',
    paddingBottom: '2px',
  },
  labelStyle: {
    color: '#0f172a',
    fontWeight: 700,
    marginBottom: '4px',
  },
}

export type AnalyticsMetaItem = {
  label: string
  value: string
  tone?: 'neutral' | 'info' | 'success' | 'warning' | 'danger'
}

function toFiniteNumber(value: unknown) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function formatPercentTick(value: unknown) {
  const numeric = toFiniteNumber(value)
  if (numeric === null) {
    return ''
  }
  return `${Math.round(numeric)}%`
}

export function formatCountTick(value: unknown) {
  const numeric = toFiniteNumber(value)
  if (numeric === null) {
    return ''
  }

  if (numeric >= 1000) {
    return `${(numeric / 1000).toFixed(1)}k`
  }

  return Math.round(numeric).toString()
}

export function truncateChartLabel(value: unknown, max = 18) {
  const normalized = typeof value === 'string' ? value.trim() : String(value ?? '')
  if (!normalized) {
    return ''
  }

  if (normalized.length <= max) {
    return normalized
  }

  return `${normalized.slice(0, Math.max(1, max - 3)).trimEnd()}...`
}

export function getCategoricalChartHeight(rowCount: number, min = 320, perRow = 46, max = 560) {
  if (!rowCount) {
    return min
  }

  return Math.min(Math.max(min, rowCount * perRow + 72), max)
}

function toneClasses(tone: AnalyticsMetaItem['tone']) {
  switch (tone) {
    case 'info':
      return 'border-sky-200 bg-sky-50 text-sky-800'
    case 'success':
      return 'border-emerald-200 bg-emerald-50 text-emerald-800'
    case 'warning':
      return 'border-amber-200 bg-amber-50 text-amber-800'
    case 'danger':
      return 'border-rose-200 bg-rose-50 text-rose-800'
    default:
      return 'border-slate-200 bg-slate-50 text-slate-700'
  }
}

export function AnalyticsMetaStrip({
  items,
  className,
}: {
  items: AnalyticsMetaItem[]
  className?: string
}) {
  if (!items.length) {
    return null
  }

  return (
    <div className={cn('analytics-badge-row', className)}>
      {items.map((item) => (
        <Badge
          key={`${item.label}-${item.value}`}
          variant="outline"
          className={cn('rounded-full px-3 py-1 text-[11px] font-medium', toneClasses(item.tone))}
        >
          <span className="opacity-80">{item.label}:</span>
          <span className="ml-1 font-semibold">{item.value}</span>
        </Badge>
      ))}
    </div>
  )
}

export function AnalyticsChartPanel({
  children,
  meta = [],
  note,
  className,
}: {
  children: React.ReactNode
  meta?: AnalyticsMetaItem[]
  note?: string
  className?: string
}) {
  return (
    <div className={cn('rounded-xl border border-slate-200 bg-gradient-to-b from-white via-white to-slate-50/70 p-4', className)}>
      <AnalyticsMetaStrip items={meta} className="mb-4" />
      {children}
      {note ? <p className="mt-3 text-xs leading-5 text-slate-500">{note}</p> : null}
    </div>
  )
}

export function AnalyticsChartEmpty({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
      {message}
    </div>
  )
}
