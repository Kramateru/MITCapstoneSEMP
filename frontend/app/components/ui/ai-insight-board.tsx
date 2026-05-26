'use client'

import { cn } from './utils'

export type AiInsightSection = {
  title: string
  items: string[]
  tone?: 'sky' | 'emerald' | 'amber' | 'violet' | 'rose' | 'teal' | 'slate'
  emptyMessage?: string
}

const toneClasses: Record<
  NonNullable<AiInsightSection['tone']>,
  { badge: string; card: string; bullet: string }
> = {
  sky: {
    badge: 'border-sky-200 bg-sky-50 text-sky-700',
    card: 'border-sky-100/90 bg-[linear-gradient(180deg,#ffffff_0%,#f7fbff_100%)]',
    bullet: 'bg-sky-500/70',
  },
  emerald: {
    badge: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    card: 'border-emerald-100/90 bg-[linear-gradient(180deg,#ffffff_0%,#f6fffb_100%)]',
    bullet: 'bg-emerald-500/70',
  },
  amber: {
    badge: 'border-amber-200 bg-amber-50 text-amber-700',
    card: 'border-amber-100/90 bg-[linear-gradient(180deg,#ffffff_0%,#fffaf0_100%)]',
    bullet: 'bg-amber-500/70',
  },
  violet: {
    badge: 'border-violet-200 bg-violet-50 text-violet-700',
    card: 'border-violet-100/90 bg-[linear-gradient(180deg,#ffffff_0%,#faf7ff_100%)]',
    bullet: 'bg-violet-500/70',
  },
  rose: {
    badge: 'border-rose-200 bg-rose-50 text-rose-700',
    card: 'border-rose-100/90 bg-[linear-gradient(180deg,#ffffff_0%,#fff7f7_100%)]',
    bullet: 'bg-rose-500/70',
  },
  teal: {
    badge: 'border-teal-200 bg-teal-50 text-teal-700',
    card: 'border-teal-100/90 bg-[linear-gradient(180deg,#ffffff_0%,#f4fffd_100%)]',
    bullet: 'bg-teal-500/70',
  },
  slate: {
    badge: 'border-slate-200 bg-slate-50 text-slate-700',
    card: 'border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)]',
    bullet: 'bg-slate-400/70',
  },
}

function noteCountLabel(count: number) {
  if (count <= 0) {
    return 'No notes'
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
          const items = Array.isArray(section.items)
            ? section.items.map((item) => `${item ?? ''}`.trim()).filter(Boolean)
            : []

          return (
            <div
              key={section.title}
              className={cn(
                'analytics-note-card flex h-full flex-col rounded-[1.55rem] border p-5 shadow-[0_18px_38px_-30px_rgba(15,23,42,0.18)] sm:p-6',
                tone.card,
              )}
            >
              <div className="space-y-3">
                <div className="text-[1.05rem] font-semibold leading-7 tracking-[-0.015em] text-slate-950">
                  {section.title}
                </div>
                <span
                  className={cn(
                    'inline-flex w-fit shrink-0 items-center justify-center whitespace-nowrap rounded-full border px-3 py-1.5 text-[0.72rem] font-semibold uppercase tracking-[0.1em] shadow-sm',
                    tone.badge,
                  )}
                >
                  {noteCountLabel(items.length)}
                </span>
              </div>

              <div className="mt-4 flex-1 text-[0.95rem] leading-7 text-slate-700">
                {items.length ? (
                  <ul className="space-y-3">
                    {items.map((item, index) => (
                      <li
                        key={`${section.title}-${index}`}
                        className="rounded-[1.1rem] border border-white/80 bg-white/88 px-4 py-3 shadow-[0_14px_30px_-26px_rgba(15,23,42,0.28)]"
                      >
                        <div className="flex items-start gap-3">
                          <span className={cn('mt-2 size-2 shrink-0 rounded-full', tone.bullet)} aria-hidden="true" />
                          <span className="min-w-0 whitespace-pre-wrap text-slate-700">{item}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="rounded-[1.1rem] border border-dashed border-slate-200 bg-white/72 px-4 py-3 text-slate-500">
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
