'use client'

import { type LucideIcon } from 'lucide-react'

import { cn } from './utils'

export type ReportNavigationItem = {
  value: string
  title: string
  description: string
  icon: LucideIcon
  metrics: Array<{
    label: string
    value: string
  }>
}

export function ReportNavigation({
  title,
  description,
  items,
  activeValue,
  onChange,
  className,
}: {
  title: string
  description: string
  items: ReportNavigationItem[]
  activeValue: string
  onChange: (value: string) => void
  className?: string
}) {
  return (
    <div className={cn('space-y-4', className)}>
      <div className="space-y-1 reading-width">
        <h2 className="text-base font-semibold text-slate-950">{title}</h2>
        <p className="text-sm leading-6 text-slate-500">{description}</p>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => {
          const Icon = item.icon
          const isActive = item.value === activeValue

          return (
            <button
              key={item.value}
              type="button"
              onClick={() => onChange(item.value)}
              className={cn(
                'group flex min-h-full flex-col rounded-[26px] border bg-white p-4 text-left shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 sm:p-5',
                isActive
                  ? 'border-sky-300 bg-sky-50/70 shadow-sky-100'
                  : 'border-slate-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md',
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div
                  className={cn(
                    'rounded-2xl p-3 transition',
                    isActive ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-700 group-hover:bg-slate-200',
                  )}
                >
                  <Icon className="size-5" />
                </div>
                <span
                  className={cn(
                    'rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]',
                    isActive
                      ? 'border-sky-300 bg-white text-sky-700'
                      : 'border-slate-200 bg-slate-50 text-slate-500',
                  )}
                >
                  {isActive ? 'Viewing' : 'Open'}
                </span>
              </div>

              <div className="mt-4 min-w-0">
                <div className="text-base font-semibold text-slate-950">{item.title}</div>
                <p className="mt-2 text-sm leading-6 text-slate-600">{item.description}</p>
              </div>

              <div className="mt-4 grid gap-2 sm:mt-auto sm:grid-cols-3">
                {item.metrics.map((metric) => (
                  <div key={`${item.value}-${metric.label}`} className="rounded-2xl bg-slate-50 px-3 py-2">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                      {metric.label}
                    </div>
                    <div className="mt-1 text-sm font-semibold text-slate-950">{metric.value}</div>
                  </div>
                ))}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
