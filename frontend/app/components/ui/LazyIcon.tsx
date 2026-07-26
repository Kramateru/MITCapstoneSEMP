'use client'

import dynamic from 'next/dynamic'
import React, { Suspense } from 'react'

type LazyIconProps = React.ComponentPropsWithoutRef<'svg'> & {
  name: string
  [key: string]: unknown
}

const DynamicLucideIcon = dynamic(
  () => import('./lucide-icon-renderer').then((mod) => mod.LucideIconRenderer),
  { ssr: false },
)

export function LazyIcon({ name, className, ...props }: LazyIconProps) {
  return (
    <Suspense fallback={<span className={className} /> }>
      <DynamicLucideIcon name={name} className={className} {...props} />
    </Suspense>
  )
}

export default LazyIcon
