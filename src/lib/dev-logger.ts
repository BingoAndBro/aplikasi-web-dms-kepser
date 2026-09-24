let lastLogKey: string | null = null
let lastWarnKey: string | null = null

function safeStringify(data: unknown): string {
  try {
    return JSON.stringify(data)
  } catch {
    return '"[unserializable]"'
  }
}

export function logDev(key: string, data: unknown, dedupKey?: string) {
  if (!import.meta.env.DEV) return

  const currentKey = dedupKey ?? `${key}:${safeStringify(data)}`
  if (currentKey === lastLogKey) return

  lastLogKey = currentKey
  console.log(key, data)
}

export function warnDev(key: string, data: unknown, dedupKey?: string) {
  if (!import.meta.env.DEV) return

  const currentKey = dedupKey ?? `${key}:${safeStringify(data)}`
  if (currentKey === lastWarnKey) return

  lastWarnKey = currentKey
  console.warn(key, data)
}
