import { describe, expect, it } from 'vitest'
import { validateTargetUrlPolicy } from '../../src/security/target-policy.js'

function validate(url: string) {
  return validateTargetUrlPolicy(new URL(url))
}

describe('target policy', () => {
  it('allows public http and https targets', () => {
    expect(validate('https://api.example.test/resource')).toEqual({ ok: true })
    expect(validate('http://api.example.test/resource')).toEqual({ ok: true })
  })

  it('allows private, loopback, and corporate-looking targets by default', () => {
    expect(validate('http://127.0.0.1:8080')).toEqual({ ok: true })
    expect(validate('http://10.0.0.10')).toEqual({ ok: true })
    expect(validate('http://192.168.1.15')).toEqual({ ok: true })
    expect(validate('http://internal.corp.example')).toEqual({ ok: true })
  })

  it('rejects unsupported URL schemes', () => {
    expect(validate('file:///etc/passwd')).toEqual({
      ok: false,
      reason: 'unsupported-scheme',
    })
  })

  it('blocks IPv4 link-local and metadata endpoints', () => {
    expect(validate('http://169.254.169.254/latest/meta-data')).toEqual({
      ok: false,
      reason: 'blocked-host',
    })
    expect(validate('http://169.254.1.10')).toEqual({
      ok: false,
      reason: 'blocked-host',
    })
  })

  it('blocks IPv6 link-local endpoints', () => {
    expect(validate('http://[fe80::1]/metadata')).toEqual({
      ok: false,
      reason: 'blocked-host',
    })
    expect(validate('http://[febf::1]/metadata')).toEqual({
      ok: false,
      reason: 'blocked-host',
    })
  })

  it('allows non-link-local IPv6 endpoints', () => {
    expect(validate('http://[fe7f::1]/resource')).toEqual({ ok: true })
    expect(validate('http://[2001:db8::1]/resource')).toEqual({ ok: true })
  })

  it('blocks known cloud metadata hostnames', () => {
    expect(validate('http://metadata.google.internal/computeMetadata/v1')).toEqual({
      ok: false,
      reason: 'blocked-host',
    })
  })
})
