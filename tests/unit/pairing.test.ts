import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PAIRING_CODE_TTL_MS,
  DEFAULT_PAIRING_MAX_ATTEMPTS,
  MemoryPairingStore,
  createBearerToken,
  createSixDigitPairingCode,
} from '../../src/security/pairing.js'

describe('pairing', () => {
  it('creates six digit pairing codes', () => {
    expect(createSixDigitPairingCode()).toMatch(/^\d{6}$/)
  })

  it('creates high-entropy bearer tokens', () => {
    expect(createBearerToken()).toMatch(/^[\w-]{43}$/)
  })

  it('exposes the current terminal pairing code snapshot', () => {
    const store = new MemoryPairingStore({
      codeGenerator: () => '123456',
      now: () => 1000,
    })

    expect(store.getPairingCode()).toEqual({
      code: '123456',
      expiresAt: 1000 + DEFAULT_PAIRING_CODE_TTL_MS,
    })
  })

  it('pairs a valid code and stores the generated bearer token', () => {
    const store = new MemoryPairingStore({
      codeGenerator: () => '123456',
      tokenGenerator: () => 'token-1',
    })

    expect(store.hasToken('token-1')).toBe(false)
    expect(store.pair('123456')).toEqual({
      ok: true,
      token: 'token-1',
    })
    expect(store.hasToken('token-1')).toBe(true)
  })

  it('rejects invalid pairing codes without storing a token', () => {
    const store = new MemoryPairingStore({
      codeGenerator: () => '123456',
      tokenGenerator: () => 'token-1',
    })

    expect(store.pair('000000')).toEqual({
      ok: false,
      reason: 'invalid-code',
    })
    expect(store.hasToken('token-1')).toBe(false)
  })

  it('rejects expired pairing codes', () => {
    let now = 1000
    const store = new MemoryPairingStore({
      codeGenerator: () => '123456',
      now: () => now,
      tokenGenerator: () => 'token-1',
      ttlMs: 10,
    })
    now = 1011

    expect(store.pair('123456')).toEqual({
      ok: false,
      reason: 'expired',
    })
    expect(store.hasToken('token-1')).toBe(false)
  })

  it('enforces the pairing attempt limit before accepting a code', () => {
    const store = new MemoryPairingStore({
      codeGenerator: () => '123456',
      maxAttempts: 2,
      tokenGenerator: () => 'token-1',
    })

    expect(store.pair('000000')).toEqual({
      ok: false,
      reason: 'invalid-code',
    })
    expect(store.pair('111111')).toEqual({
      ok: false,
      reason: 'invalid-code',
    })
    expect(store.pair('123456')).toEqual({
      ok: false,
      reason: 'attempt-limit',
    })
    expect(store.hasToken('token-1')).toBe(false)
  })

  it('uses the default pairing attempt limit', () => {
    const store = new MemoryPairingStore({
      codeGenerator: () => '123456',
    })

    for (let i = 0; i < DEFAULT_PAIRING_MAX_ATTEMPTS; i += 1) {
      expect(store.pair('000000')).toEqual({
        ok: false,
        reason: 'invalid-code',
      })
    }

    expect(store.pair('000000')).toEqual({
      ok: false,
      reason: 'attempt-limit',
    })
  })
})
