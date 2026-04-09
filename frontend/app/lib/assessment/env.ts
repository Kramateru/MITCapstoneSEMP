import fs from 'node:fs'
import path from 'node:path'

const envCache = new Map<string, string>()
let cacheHydrated = false

const envFiles = [
  path.resolve(process.cwd(), '.env.local'),
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '../.env'),
  path.resolve(process.cwd(), '../backend/.env'),
]

function hydrateEnvCache() {
  if (cacheHydrated) {
    return
  }

  for (const filePath of envFiles) {
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
  for (const key of possibleKeys) {
    const directValue = process.env[key]
    if (directValue) {
      return directValue
    }
  }

  hydrateEnvCache()

  for (const key of possibleKeys) {
    const cachedValue = envCache.get(key)
    if (cachedValue) {
      return cachedValue
    }
  }

  if (fallback !== undefined) {
    return fallback
  }

  throw new Error(`Missing required configuration. Checked: ${possibleKeys.join(', ')}`)
}
