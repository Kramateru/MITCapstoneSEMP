'use client'

import dynamic from 'next/dynamic'
import React, { Suspense } from 'react'

type LazyIconProps = React.ComponentPropsWithoutRef<'svg'> & {
  name: string
  [key: string]: unknown
}

function loadIcon(name: string) {
  return dynamic(async () => {
    const mod = await import('lucide-react')
    // @ts-expect-error dynamic index
    const Icon = mod[name] || mod.Activity
    return Icon as React.ComponentType<any>
  }, { ssr: false })
}

export function LazyIcon({ name, className, ...props }: LazyIconProps) {
  const Icon = React.useMemo(() => loadIcon(name), [name])
  return (
    <Suspense fallback={<span className={className} /> }>
      <Icon className={className} {...props} />
    </Suspense>
  )
}

export default LazyIcon
