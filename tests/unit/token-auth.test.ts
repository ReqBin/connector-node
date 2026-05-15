import { describe, expect, it } from 'vitest'
import { MemoryPairingStore } from '../../src/security/pairing.js'
import { authorizeBearerToken, parseBearerToken } from '../../src/security/token-auth.js'

describe('token auth', () => {
  it('parses bearer tokens', () => {
    expect(parseBearerToken('Bearer token-1')).toBe('token-1')
    expect(parseBearerToken('bearer token-1')).toBe('token-1')
    expect(parseBearerToken('Bearer   token-1   ')).toBe('token-1')
  })

  it('rejects missing or malformed authorization headers', () => {
    expect(parseBearerToken(undefined)).toBeUndefined()
    expect(parseBearerToken('token-1')).toBeUndefined()
    expect(parseBearerToken('Bearer ')).toBeUndefined()
  })

  it('authorizes stored bearer tokens', () => {
    const pairingStore = new MemoryPairingStore({
      codeGenerator: () => '123456',
      tokenGenerator: () => 'token-1',
    })
    pairingStore.pair('123456')

    expect(authorizeBearerToken('Bearer token-1', pairingStore)).toEqual({
      mode: 'token',
      ok: true,
    })
  })

  it('rejects missing bearer tokens by default', () => {
    const pairingStore = new MemoryPairingStore()

    expect(authorizeBearerToken(undefined, pairingStore)).toEqual({
      ok: false,
      reason: 'missing-token',
    })
  })

  it('rejects unknown bearer tokens', () => {
    const pairingStore = new MemoryPairingStore()

    expect(authorizeBearerToken('Bearer token-1', pairingStore)).toEqual({
      ok: false,
      reason: 'invalid-token',
    })
  })

  it('allows requests when auth is explicitly disabled', () => {
    const pairingStore = new MemoryPairingStore()

    expect(authorizeBearerToken(undefined, pairingStore, {
      authDisabled: true,
    })).toEqual({
      mode: 'disabled',
      ok: true,
    })
  })
})
