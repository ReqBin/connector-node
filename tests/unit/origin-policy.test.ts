import { describe, expect, it } from 'vitest'
import { DEFAULT_ALLOWED_ORIGINS, DEV_ALLOWED_ORIGINS, isOriginAllowed, resolveAllowedOrigins } from '../../src/security/origin-policy.js'

describe('origin policy', () => {
  it('allows only production ReqBin origins by default', () => {
    expect(resolveAllowedOrigins()).toEqual(new Set(DEFAULT_ALLOWED_ORIGINS))
    expect(isOriginAllowed('https://reqbin.com')).toBe(true)
    expect(isOriginAllowed('https://beta.reqbin.com')).toBe(true)
    expect(isOriginAllowed('http://localhost:3000')).toBe(false)
    expect(isOriginAllowed(undefined)).toBe(false)
  })

  it('allows development origins only when enabled', () => {
    for (const origin of DEV_ALLOWED_ORIGINS) {
      expect(isOriginAllowed(origin)).toBe(false)
      expect(isOriginAllowed(origin, { allowDevOrigins: true })).toBe(true)
    }
  })

  it('extends the allowlist with explicit origins', () => {
    expect(isOriginAllowed('http://localhost:8080', {
      allowedOrigins: ['http://localhost:8080'],
    })).toBe(true)
  })
})
