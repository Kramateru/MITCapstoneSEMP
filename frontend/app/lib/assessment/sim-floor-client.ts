'use client'

function getToken() {
  return window.localStorage.getItem('token')
}

export function openSimFloorRealtimeStream() {
  const token = getToken()
  if (!token) {
    throw new Error('Missing session token.')
  }

  return new EventSource(`/api/sim-floor/stream?token=${encodeURIComponent(token)}`)
}
