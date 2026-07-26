'use client'

import { LazyIcon } from '@/app/components/ui/LazyIcon'
import { Card, CardContent } from '@/app/components/ui/card'

const Loader2 = (props: any) => <LazyIcon name="Loader2" {...props} />

export function RouteLoadingState({ label = 'Loading workspace...' }: { label?: string }) {
  return (
    <Card className="border-slate-200 shadow-sm">
      <CardContent className="flex min-h-[280px] items-center justify-center gap-3 p-8 text-sm text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
        <span>{label}</span>
      </CardContent>
    </Card>
  )
}
