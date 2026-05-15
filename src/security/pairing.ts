import { randomBytes, randomInt } from 'node:crypto'

export const DEFAULT_PAIRING_CODE_TTL_MS = 5 * 60 * 1000
export const DEFAULT_PAIRING_MAX_ATTEMPTS = 5

export interface PairingCodeSnapshot {
  code: string
  expiresAt: number
}

export interface PairingSuccess {
  ok: true
  token: string
}

export interface PairingFailure {
  ok: false
  reason: 'attempt-limit' | 'expired' | 'invalid-code'
}

export type PairingResult = PairingSuccess | PairingFailure

export interface PairingStore {
  getPairingCode(): PairingCodeSnapshot
  hasToken(token: string): boolean
  pair(code: string): PairingResult
}

interface MemoryPairingStoreOptions {
  codeGenerator?: () => string
  maxAttempts?: number
  now?: () => number
  tokenGenerator?: () => string
  ttlMs?: number
}

export function createSixDigitPairingCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

export function createBearerToken(): string {
  return randomBytes(32).toString('base64url')
}

export class MemoryPairingStore implements PairingStore {
  private attempts = 0
  private readonly code: string
  private readonly expiresAt: number
  private readonly maxAttempts: number
  private readonly now: () => number
  private readonly tokenGenerator: () => string
  private readonly tokens = new Set<string>()

  constructor({
    codeGenerator = createSixDigitPairingCode,
    maxAttempts = DEFAULT_PAIRING_MAX_ATTEMPTS,
    now = Date.now,
    tokenGenerator = createBearerToken,
    ttlMs = DEFAULT_PAIRING_CODE_TTL_MS,
  }: MemoryPairingStoreOptions = {}) {
    this.code = codeGenerator()
    this.expiresAt = now() + ttlMs
    this.maxAttempts = maxAttempts
    this.now = now
    this.tokenGenerator = tokenGenerator
  }

  getPairingCode(): PairingCodeSnapshot {
    return {
      code: this.code,
      expiresAt: this.expiresAt,
    }
  }

  hasToken(token: string): boolean {
    return this.tokens.has(token)
  }

  pair(code: string): PairingResult {
    if (this.attempts >= this.maxAttempts) {
      return { ok: false, reason: 'attempt-limit' }
    }

    if (this.now() >= this.expiresAt) {
      return { ok: false, reason: 'expired' }
    }

    if (code !== this.code) {
      this.attempts += 1
      return { ok: false, reason: 'invalid-code' }
    }

    const token = this.tokenGenerator()
    this.tokens.add(token)

    return {
      ok: true,
      token,
    }
  }
}
