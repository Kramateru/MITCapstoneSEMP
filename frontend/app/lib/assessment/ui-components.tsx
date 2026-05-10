/**
 * Assessment Module UI Components
 * Provides empty states, error displays, and loading indicators
 */

'use client'

import React, { ReactNode } from 'react'
import { ErrorInfo } from './error-handling'

interface EmptyStateProps {
  title: string
  description?: string
  icon?: ReactNode
  action?: {
    label: string
    onClick: () => void
  }
}

export function EmptyState({ title, description, icon, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4">
      {icon && <div className="mb-4 text-4xl text-gray-300">{icon}</div>}
      <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
      {description && <p className="text-sm text-gray-600 mb-4 text-center max-w-md">{description}</p>}
      {action && (
        <button
          onClick={action.onClick}
          className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}

interface LoadingSkeletonProps {
  count?: number
  height?: string
}

export function LoadingSkeleton({ count = 1, height = '4rem' }: LoadingSkeletonProps) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          style={{ height }}
          className="bg-gray-200 rounded-lg animate-pulse"
        />
      ))}
    </div>
  )
}

interface ErrorDisplayProps {
  error: ErrorInfo
  onRetry?: () => void
  onDismiss?: () => void
}

export function ErrorDisplay({ error, onRetry, onDismiss }: ErrorDisplayProps) {
  const bgColor = {
    error: 'bg-red-50 border-red-200',
    warning: 'bg-yellow-50 border-yellow-200',
    info: 'bg-blue-50 border-blue-200',
  }[error.severity]

  const textColor = {
    error: 'text-red-800',
    warning: 'text-yellow-800',
    info: 'text-blue-800',
  }[error.severity]

  const borderColor = {
    error: 'border-l-red-500',
    warning: 'border-l-yellow-500',
    info: 'border-l-blue-500',
  }[error.severity]

  const icon = {
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️',
  }[error.severity]

  return (
    <div className={`${bgColor} border ${borderColor} border-l-4 rounded-lg p-4`}>
      <div className="flex items-start gap-3">
        <span className="text-xl flex-shrink-0">{icon}</span>
        <div className="flex-1">
          <h4 className={`${textColor} font-semibold mb-1`}>{error.title}</h4>
          <p className={`${textColor} text-sm opacity-90`}>{error.message}</p>
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className={`${textColor} hover:opacity-70 flex-shrink-0 text-lg`}
            aria-label="Dismiss"
          >
            ×
          </button>
        )}
      </div>
      {error.recoverable && (onRetry || onDismiss) && (
        <div className="flex gap-2 mt-3">
          {onRetry && (
            <button
              onClick={onRetry}
              className={`text-sm font-medium ${textColor} hover:opacity-70`}
            >
              Try Again
            </button>
          )}
          {onDismiss && (
            <button
              onClick={onDismiss}
              className={`text-sm font-medium ${textColor} hover:opacity-70 ml-auto`}
            >
              Dismiss
            </button>
          )}
        </div>
      )}
    </div>
  )
}

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: (error: Error, retry: () => void) => ReactNode
  onError?: (error: Error) => void
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error) {
    console.error('Assessment Error Boundary:', error)
    this.props.onError?.(error)
  }

  retry = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.retry)
      }

      return (
        <div className="p-4">
          <ErrorDisplay
            error={{
              title: 'Error Loading Assessment',
              message: this.state.error.message || 'An unexpected error occurred.',
              severity: 'error',
              code: 'ERROR_BOUNDARY',
              recoverable: true,
            }}
            onRetry={this.retry}
          />
        </div>
      )
    }

    return this.props.children
  }
}

/**
 * Wrapper component that handles loading, error, and empty states
 */
interface AsyncStateProps<T> {
  isLoading: boolean
  error: ErrorInfo | null
  data: T | null
  isEmpty?: (data: T) => boolean
  onRetry?: () => void
  loadingComponent?: ReactNode
  errorComponent?: (error: ErrorInfo, retry?: () => void) => ReactNode
  emptyComponent?: ReactNode
  children: (data: T) => ReactNode
}

export function AsyncState<T>({
  isLoading,
  error,
  data,
  isEmpty = () => false,
  onRetry,
  loadingComponent,
  errorComponent,
  emptyComponent,
  children,
}: AsyncStateProps<T>) {
  if (isLoading) {
    return <>{loadingComponent || <LoadingSkeleton />}</>
  }

  if (error) {
    return (
      <>
        {errorComponent ? (
          errorComponent(error, onRetry)
        ) : (
          <ErrorDisplay error={error} onRetry={onRetry} />
        )}
      </>
    )
  }

  if (!data || isEmpty(data)) {
    return <>{emptyComponent || <EmptyState title="No Data Available" />}</>
  }

  return <>{children(data)}</>
}

/**
 * Loading indicator component
 */
interface LoadingIndicatorProps {
  size?: 'small' | 'medium' | 'large'
  text?: string
}

export function LoadingIndicator({ size = 'medium', text }: LoadingIndicatorProps) {
  const sizeClass = {
    small: 'w-4 h-4',
    medium: 'w-8 h-8',
    large: 'w-12 h-12',
  }[size]

  return (
    <div className="flex flex-col items-center justify-center gap-2">
      <div className={`${sizeClass} border-4 border-gray-200 border-t-blue-600 rounded-full animate-spin`} />
      {text && <p className="text-sm text-gray-600">{text}</p>}
    </div>
  )
}
