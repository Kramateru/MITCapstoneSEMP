/**
 * Assessment Module Loading States
 * Provides hooks for managing loading and error states across assessment views
 */

'use client'

import { createContext, ReactNode, useCallback, useContext, useState } from 'react'
import { ErrorInfo, getErrorInfo, logError } from './error-handling'

export interface LoadingState {
  isLoading: boolean
  error: ErrorInfo | null
  data: unknown | null
}

interface LoadingContextType {
  states: Record<string, LoadingState>
  setLoading: (key: string, isLoading: boolean) => void
  setError: (key: string, error: unknown) => void
  setData: (key: string, data: unknown) => void
  clearError: (key: string) => void
  reset: (key: string) => void
}

const LoadingContext = createContext<LoadingContextType | null>(null)

export function LoadingProvider({ children }: { children: ReactNode }) {
  const [states, setStates] = useState<Record<string, LoadingState>>({})

  const setLoading = useCallback((key: string, isLoading: boolean) => {
    setStates((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        isLoading,
        error: isLoading ? null : prev[key]?.error,
      },
    }))
  }, [])

  const setError = useCallback((key: string, error: unknown) => {
    const errorInfo = getErrorInfo(error)
    logError(error, key)
    setStates((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        error: errorInfo,
        isLoading: false,
      },
    }))
  }, [])

  const setData = useCallback((key: string, data: unknown) => {
    setStates((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        data,
        isLoading: false,
        error: null,
      },
    }))
  }, [])

  const clearError = useCallback((key: string) => {
    setStates((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        error: null,
      },
    }))
  }, [])

  const reset = useCallback((key: string) => {
    setStates((prev) => {
      const newStates = { ...prev }
      delete newStates[key]
      return newStates
    })
  }, [])

  return (
    <LoadingContext.Provider value={{ states, setLoading, setError, setData, clearError, reset }}>
      {children}
    </LoadingContext.Provider>
  )
}

export function useLoadingState(key: string) {
  const context = useContext(LoadingContext)
  if (!context) {
    throw new Error('useLoadingState must be used within LoadingProvider')
  }

  const state = context.states[key] || {
    isLoading: false,
    error: null,
    data: null,
  }

  return {
    ...state,
    setLoading: (isLoading: boolean) => context.setLoading(key, isLoading),
    setError: (error: unknown) => context.setError(key, error),
    setData: (data: unknown) => context.setData(key, data),
    clearError: () => context.clearError(key),
    reset: () => context.reset(key),
  }
}

/**
 * Hook for managing async operations with automatic state management
 */
export function useAsyncOperation<T>(key: string) {
  const { setLoading, setError, setData, ...state } = useLoadingState(key)

  const execute = useCallback(
    async (operation: () => Promise<T>) => {
      setLoading(true)
      try {
        const result = await operation()
        setData(result)
        return result
      } catch (error) {
        setError(error)
        throw error
      }
    },
    [key, setLoading, setError, setData],
  )

  return {
    ...state,
    execute,
    isLoading: state.isLoading,
    error: state.error,
    data: state.data as T | null,
  }
}

/**
 * Hook for managing loading state of list operations
 */
export function useListLoadingState(key: string) {
  const state = useLoadingState(key)
  return {
    ...state,
    isEmpty: !state.isLoading && (!state.data || (Array.isArray(state.data) && state.data.length === 0)),
    count: Array.isArray(state.data) ? state.data.length : 0,
  }
}
