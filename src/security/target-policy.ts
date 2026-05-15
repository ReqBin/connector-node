import net from 'node:net'

export interface TargetPolicySuccess {
  ok: true
}

export interface TargetPolicyFailure {
  ok: false
  reason: 'blocked-host' | 'unsupported-scheme'
}

export type TargetPolicyResult = TargetPolicySuccess | TargetPolicyFailure

const blockedMetadataHostnames = new Set([
  'metadata.google.internal',
])

function normalizeHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/^\[/, '').replace(/\]$/, '')
}

function isIPv4LinkLocal(hostname: string): boolean {
  if (net.isIP(hostname) !== 4) {
    return false
  }

  const [first, second] = hostname.split('.').map(Number)
  return first === 169 && second === 254
}

function isIPv6LinkLocal(hostname: string): boolean {
  if (net.isIP(hostname) !== 6) {
    return false
  }

  const firstHextet = Number.parseInt(hostname.slice(0, hostname.indexOf(':')), 16)
  return firstHextet >= 0xfe80 && firstHextet <= 0xfebf
}

function isBlockedHost(hostname: string): boolean {
  const normalized = normalizeHostname(hostname)

  return blockedMetadataHostnames.has(normalized)
    || isIPv4LinkLocal(normalized)
    || isIPv6LinkLocal(normalized)
}

export function validateTargetUrlPolicy(url: URL): TargetPolicyResult {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return {
      ok: false,
      reason: 'unsupported-scheme',
    }
  }

  if (isBlockedHost(url.hostname)) {
    return {
      ok: false,
      reason: 'blocked-host',
    }
  }

  return {
    ok: true,
  }
}
