import fs from 'node:fs'
import path from 'node:path'

const envCache = new Map<string, string>()
let cacheHydrated = false

function normalizeConfigCandidate(value?: string | null) {
  const trimmed = (value || '').trim()
  if (
    !trimmed
    || trimmed === 'undefined'
    || trimmed === 'null'
    || /^your[_-]/i.test(trimmed)
  ) {
    return ''
  }

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
    || (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim()
  }

  return trimmed
}

function buildEnvFiles() {
  const candidateRoots = [
    process.cwd(),
    path.resolve(process.cwd(), 'frontend'),
    path.resolve(process.cwd(), '..'),
  ]

  return Array.from(
    new Set(
      candidateRoots.flatMap((root) => ([
        path.resolve(root, '.env.local'),
        path.resolve(root, '.env'),
        path.resolve(root, 'backend', '.env'),
      ])),
    ),
  )
}

function hydrateEnvCache() {
  if (cacheHydrated) {
    return
  }

  for (const filePath of buildEnvFiles()) {
    if (!fs.existsSync(filePath)) {
      continue
    }

    const raw = fs.readFileSync(filePath, 'utf8')
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) {
        continue
      }

      const separatorIndex = trimmed.indexOf('=')
      if (separatorIndex <= 0) {
        continue
      }

      const key = trimmed.slice(0, separatorIndex).trim()
      const value = trimmed.slice(separatorIndex + 1).trim()
      if (!envCache.has(key)) {
        envCache.set(key, value)
      }
    }
  }

  cacheHydrated = true
}

export function getConfigValue(possibleKeys: string[], fallback?: string) {
  hydrateEnvCache()

  for (const key of possibleKeys) {
    const cachedValue = normalizeConfigCandidate(envCache.get(key))
    if (cachedValue) {
      return cachedValue
    }
  }

  for (const key of possibleKeys) {
    const directValue = normalizeConfigCandidate(process.env[key])
    if (directValue) {
      return directValue
    }
  }

  if (fallback !== undefined) {
    return fallback
  }

  throw new Error(`Missing required configuration. Checked: ${possibleKeys.join(', ')}`)
}
