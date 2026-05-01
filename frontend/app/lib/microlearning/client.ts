'use client'

import { getBackendWebSocketUrl } from '@/app/utils/ws'

export type DeleteModuleDependenciesResult = {
  status: 'deleted'
  module_id: string
  title: string
  deleted_assignments: number
  deleted_certificates: number
  deleted_storage_count: number
  impacted_trainee_ids: string[]
  impacted_batch_ids: string[]
}

function getDeleteErrorMessage(payload: unknown, fallback: string) {
  if (typeof payload === 'string' && payload.trim()) {
    return payload
  }

  if (payload && typeof payload === 'object') {
    const candidate = payload as { detail?: unknown; error?: unknown; message?: unknown }
    for (const value of [candidate.detail, candidate.error, candidate.message]) {
      if (typeof value === 'string' && value.trim()) {
        return value
      }
    }
  }

  return fallback
}

export async function deleteModuleAndDependencies(
  moduleId: string,
  token: string,
): Promise<DeleteModuleDependenciesResult> {
  if (!moduleId.trim()) {
    throw new Error('A module id is required before delete can run.')
  }

  if (!token.trim()) {
    throw new Error('Your trainer session has expired. Sign in again before deleting a module.')
  }

  const response = await fetch(`/api/trainer/microlearning-modules/${moduleId}`, {
    method: 'DELETE',
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(
      getDeleteErrorMessage(
        payload,
        'Delete failed. Refresh the workspace before retrying so you can confirm the current assignment state.',
      ),
    )
  }

  return payload as DeleteModuleDependenciesResult
}

export function openTraineeMicrolearningLiveUpdates(token: string) {
  if (!token.trim()) {
    throw new Error('Missing session token.')
  }

  return new WebSocket(
    getBackendWebSocketUrl(`/api/trainee/live-updates?token=${encodeURIComponent(token)}`),
  )
}
