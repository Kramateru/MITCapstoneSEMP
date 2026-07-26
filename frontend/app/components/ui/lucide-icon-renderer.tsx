'use client'

import * as Icons from 'lucide-react'
import React from 'react'

type LucideIconRendererProps = React.ComponentPropsWithoutRef<'svg'> & {
  name: string
}

export function LucideIconRenderer({ name, ...props }: LucideIconRendererProps) {
  const Icon = (Icons as unknown as Record<string, React.ComponentType<React.ComponentPropsWithoutRef<'svg'>>>)[name] || Icons.Activity

  return <Icon {...props} />
}
