"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import * as React from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./card";
import { cn } from "./utils";

type Tone = "blue" | "green" | "amber" | "rose" | "violet" | "slate";

const toneStyles: Record<
  Tone,
  {
    icon: string;
    accentText: string;
    ring: string;
    surface: string;
  }
> = {
  blue: {
    icon: "bg-sky-100 text-sky-700",
    accentText: "text-sky-700",
    ring: "ring-sky-100",
    surface: "from-sky-50/70 via-white to-white",
  },
  green: {
    icon: "bg-emerald-100 text-emerald-700",
    accentText: "text-emerald-700",
    ring: "ring-emerald-100",
    surface: "from-emerald-50/70 via-white to-white",
  },
  amber: {
    icon: "bg-amber-100 text-amber-700",
    accentText: "text-amber-700",
    ring: "ring-amber-100",
    surface: "from-amber-50/70 via-white to-white",
  },
  rose: {
    icon: "bg-rose-100 text-rose-700",
    accentText: "text-rose-700",
    ring: "ring-rose-100",
    surface: "from-rose-50/70 via-white to-white",
  },
  violet: {
    icon: "bg-violet-100 text-violet-700",
    accentText: "text-violet-700",
    ring: "ring-violet-100",
    surface: "from-violet-50/70 via-white to-white",
  },
  slate: {
    icon: "bg-slate-100 text-slate-700",
    accentText: "text-slate-700",
    ring: "ring-slate-100",
    surface: "from-slate-50/70 via-white to-white",
  },
};

export function DashboardHero({
  eyebrow,
  title,
  description,
  actions,
  children,
  className,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("dashboard-hero p-4 sm:p-6 lg:p-8", className)}>
      <div className="relative z-10 flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div className="space-y-3 reading-width">
          {eyebrow ? <span className="dashboard-kicker">{eyebrow}</span> : null}
          <div className="space-y-2">
            <h2 className="text-2xl font-bold tracking-[-0.03em] text-foreground sm:text-3xl xl:text-[2.45rem]">
              {title}
            </h2>
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground sm:text-[0.98rem]">
              {description}
            </p>
          </div>
        </div>
        {actions ? (
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center xl:w-auto xl:justify-end">
            {actions}
          </div>
        ) : null}
      </div>
      {children ? <div className="relative z-10 mt-6">{children}</div> : null}
    </section>
  );
}

export function MetricCard({
  label,
  value,
  hint,
  icon,
  tone = "blue",
  className,
}: {
  label: string;
  value: number | string;
  hint?: string;
  icon?: React.ReactNode;
  tone?: Tone;
  className?: string;
}) {
  const toneStyle = toneStyles[tone];

  return (
    <Card className={cn("metric-card border-border/75 bg-gradient-to-br p-0", toneStyle.surface, className)}>
      <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between sm:p-6">
        <div className="min-w-0 space-y-2">
          <p className="text-[0.72rem] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            {label}
          </p>
          <p className="break-words text-[1.7rem] font-bold tracking-[-0.03em] text-foreground sm:text-[2.15rem]">
            {value}
          </p>
          {hint ? <p className="max-w-[30ch] text-sm leading-6 text-muted-foreground">{hint}</p> : null}
        </div>
        {icon ? (
          <div className={cn("self-start rounded-2xl p-3 shadow-sm ring-1 sm:self-auto", toneStyle.icon, toneStyle.ring)}>
            {icon}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function SectionPanel({
  title,
  description,
  action,
  children,
  className,
  contentClassName,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader className="border-b border-border/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(249,251,253,0.84))]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <CardTitle>{title}</CardTitle>
            {description ? <CardDescription>{description}</CardDescription> : null}
          </div>
          {action ? <div className="w-full shrink-0 lg:w-auto">{action}</div> : null}
        </div>
      </CardHeader>
      <CardContent className={cn("pt-5 sm:pt-6", contentClassName)}>{children}</CardContent>
    </Card>
  );
}

export function ActionCard({
  href,
  title,
  description,
  icon,
  tone = "blue",
  trailing,
  className,
}: {
  href: string;
  title: string;
  description: string;
  icon?: React.ReactNode;
  tone?: Tone;
  trailing?: React.ReactNode;
  className?: string;
}) {
  const toneStyle = toneStyles[tone];

  return (
    <Link
      href={href}
      className={cn(
        "group data-card block p-4 transition-[transform,border-color,box-shadow,background-color] duration-200 hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-[0_20px_40px_-30px_rgba(15,23,42,0.28)] sm:p-5",
        className,
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          {icon ? (
            <div className={cn("mt-0.5 rounded-2xl p-3 shadow-sm ring-1", toneStyle.icon, toneStyle.ring)}>
              {icon}
            </div>
          ) : null}
          <div className="min-w-0 space-y-1.5">
            <h3 className="text-base font-semibold leading-6 text-foreground">{title}</h3>
            <p className="text-sm leading-6 text-muted-foreground">{description}</p>
          </div>
        </div>
        {trailing ?? (
          <ArrowRight className={cn("mt-1 size-4 shrink-0 self-end text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5 sm:self-auto", toneStyle.accentText)} />
        )}
      </div>
    </Link>
  );
}

export function EmptyStatePanel({
  title,
  description,
  className,
}: {
  title: string;
  description: string;
  className?: string;
}) {
  return (
    <div className={cn("empty-state-panel px-5 py-8 text-center sm:px-6", className)}>
      <div className="space-y-2">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="mx-auto max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

export function SoftStat({
  label,
  value,
  tone = "slate",
  className,
}: {
  label: string;
  value: number | string;
  tone?: Tone;
  className?: string;
}) {
  const toneStyle = toneStyles[tone];

  return (
    <div className={cn("soft-panel px-4 py-4", className)}>
      <p className="text-[0.72rem] font-bold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className={cn("mt-2 break-words text-lg font-bold tracking-[-0.02em] sm:text-xl", toneStyle.accentText)}>
        {value}
      </p>
    </div>
  );
}

export function NoticeBanner({
  tone = "blue",
  children,
  className,
}: {
  tone?: Tone;
  children: React.ReactNode;
  className?: string;
}) {
  const toneClassName: Record<Tone, string> = {
    blue: "border-sky-200 bg-sky-50 text-sky-800",
    green: "border-emerald-200 bg-emerald-50 text-emerald-800",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    rose: "border-rose-200 bg-rose-50 text-rose-800",
    violet: "border-violet-200 bg-violet-50 text-violet-800",
    slate: "border-slate-200 bg-slate-50 text-slate-700",
  };

  return (
    <div className={cn("rounded-[1.15rem] border px-4 py-3 text-sm leading-6 shadow-[0_12px_28px_-26px_rgba(15,23,42,0.2)]", toneClassName[tone], className)}>
      {children}
    </div>
  );
}
