export interface HeaderPolicySuccess {
  headers: Record<string, string>
  ok: true
  strippedHeaders: string[]
}

export interface HeaderPolicyFailure {
  header: string
  ok: false
  reason: 'invalid-header'
}

export type HeaderPolicyResult = HeaderPolicySuccess | HeaderPolicyFailure

const blockedForwardedHeaders = new Set([
  'connection',
  'content-length',
  'correlation-id',
  'host',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
])

export function sanitizeForwardedHeaders(headersText: string): HeaderPolicyResult {
  const headers: Record<string, string> = {}
  const strippedHeaders: string[] = []

  for (const rawLine of headersText.split('\n')) {
    const line = rawLine.trim()
    if (line.length === 0) {
      continue
    }

    const separatorIndex = line.indexOf(':')
    if (separatorIndex <= 0) {
      return {
        header: line,
        ok: false,
        reason: 'invalid-header',
      }
    }

    const name = line.slice(0, separatorIndex).trim()
    const value = line.slice(separatorIndex + 1).trim()
    const normalizedName = name.toLowerCase()

    if (blockedForwardedHeaders.has(normalizedName)) {
      strippedHeaders.push(name)
      continue
    }

    headers[name] = value
  }

  return {
    headers,
    ok: true,
    strippedHeaders,
  }
}
