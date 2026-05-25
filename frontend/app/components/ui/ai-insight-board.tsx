'use client'

import { cn } from './utils'

export type AiInsightSection = {
  title: string
  items: string[]
  tone?: 'sky' | 'emerald' | 'amber' | 'violet' | 'rose' | 'teal' | 'slate'
  emptyMessage?: string
}

const toneClasses: Record<NonNullable<AiInsightSection['tone']>, { badge: string; card: string }> = {
  sky: {
    badge: 'border-sky-200 bg-sky-50 text-sky-700',
    card: 'border-sky-100/90 bg-[linear-gradient(180deg,#ffffff_0%,#f7fbff_100%)]',
  },
  emerald: {
    badge: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    card: 'border-emerald-100/90 bg-[linear-gradient(180deg,#ffffff_0%,#f6fffb_100%)]',
  },
  amber: {
    badge: 'border-amber-200 bg-amber-50 text-amber-700',
    card: 'border-amber-100/90 bg-[linear-gradient(180deg,#ffffff_0%,#fffaf0_100%)]',
  },
  violet: {
    badge: 'border-violet-200 bg-violet-50 text-violet-700',
    card: 'border-violet-100/90 bg-[linear-gradient(180deg,#ffffff_0%,#faf7ff_100%)]',
  },
  rose: {
    badge: 'border-rose-200 bg-rose-50 text-rose-700',
    card: 'border-rose-100/90 bg-[linear-gradient(180deg,#ffffff_0%,#fff7f7_100%)]',
  },
  teal: {
    badge: 'border-teal-200 bg-teal-50 text-teal-700',
    card: 'border-teal-100/90 bg-[linear-gradient(180deg,#ffffff_0%,#f4fffd_100%)]',
  },
  slate: {
    badge: 'border-slate-200 bg-slate-50 text-slate-700',
    card: 'border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)]',
  },
}

function noteCountLabel(count: number) {
  if (count <= 0) {
    return 'Waiting'
  }
  return `${count} ${count === 1 ? 'note' : 'notes'}`
}

export function AiInsightBoard({
  headline,
  sections,
  className,
  gridClassName,
}: {
  headline?: string | null
  sections: AiInsightSection[]
  className?: string
  gridClassName?: string
}) {
  return (
    <div className={cn('space-y-5', className)}>
      {headline ? (
        <div className="rounded-[1.6rem] border border-sky-200 bg-[linear-gradient(135deg,rgba(240,249,255,0.96),rgba(248,250,252,0.96))] p-4 text-sm leading-7 text-sky-950 shadow-sm sm:p-5">
          {headline}
        </div>
      ) : null}

      <div className={cn('analytics-auto-grid xl:grid-cols-4', gridClassName)}>
        {sections.map((section) => {
          const tone = toneClasses[section.tone || 'slate']
          const items = section.items || []

          return (
            <div
              key={section.title}
              className={cn(
                'analytics-note-card rounded-[1.45rem] border p-4 shadow-[0_18px_38px_-30px_rgba(15,23,42,0.18)] sm:p-5',
                tone.card,
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="text-sm font-semibold tracking-[-0.01em] text-slate-950">{section.title}</div>
                <span
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.14em]',
                    tone.badge,
                  )}
                >
                  {noteCountLabel(items.length)}
                </span>
              </div>

              <div className="mt-3 space-y-2.5 text-sm leading-6 text-slate-700">
                {items.length ? (
                  items.map((item, index) => (
                    <p
                      key={`${section.title}-${index}`}
                      className="rounded-[1rem] bg-white/78 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]"
                    >
                      {item}
                    </p>
                  ))
                ) : (
                  <p className="rounded-[1rem] bg-white/70 px-3 py-2 text-slate-500">
                    {section.emptyMessage || 'No insight is available yet for this section.'}
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
