import { describe, expect, it } from 'vitest'
import { sanitizeForwardedHeaders } from '../../src/security/header-policy.js'

describe('header policy', () => {
  it('parses newline-separated header blocks', () => {
    expect(sanitizeForwardedHeaders('Accept: application/json\nX-Test: yes')).toEqual({
      headers: {
        Accept: 'application/json',
        'X-Test': 'yes',
      },
      ok: true,
      strippedHeaders: [],
    })
  })

  it('ignores empty lines and trims header values', () => {
    expect(sanitizeForwardedHeaders('\nAccept: application/json \n\n X-Test: yes \n')).toEqual({
      headers: {
        Accept: 'application/json',
        'X-Test': 'yes',
      },
      ok: true,
      strippedHeaders: [],
    })
  })

  it('allows target authorization and cookie headers', () => {
    expect(sanitizeForwardedHeaders('Authorization: Bearer target-token\nCookie: session=target')).toEqual({
      headers: {
        Authorization: 'Bearer target-token',
        Cookie: 'session=target',
      },
      ok: true,
      strippedHeaders: [],
    })
  })

  it('strips unsafe forwarded headers case-insensitively', () => {
    expect(sanitizeForwardedHeaders([
      'Host: api.example.test',
      'content-length: 99',
      'Connection: keep-alive',
      'Keep-Alive: timeout=5',
      'Proxy-Authenticate: Basic',
      'Proxy-Authorization: Basic abc',
      'TE: trailers',
      'Trailer: expires',
      'Transfer-Encoding: chunked',
      'Upgrade: websocket',
      'Correlation-ID: reqbin-id',
      'Accept: application/json',
    ].join('\n'))).toEqual({
      headers: {
        Accept: 'application/json',
      },
      ok: true,
      strippedHeaders: [
        'Host',
        'content-length',
        'Connection',
        'Keep-Alive',
        'Proxy-Authenticate',
        'Proxy-Authorization',
        'TE',
        'Trailer',
        'Transfer-Encoding',
        'Upgrade',
        'Correlation-ID',
      ],
    })
  })

  it('keeps the last duplicate safe header value', () => {
    expect(sanitizeForwardedHeaders('Accept: text/plain\nAccept: application/json')).toEqual({
      headers: {
        Accept: 'application/json',
      },
      ok: true,
      strippedHeaders: [],
    })
  })

  it('rejects malformed header lines', () => {
    expect(sanitizeForwardedHeaders('Accept: application/json\nBroken Header')).toEqual({
      header: 'Broken Header',
      ok: false,
      reason: 'invalid-header',
    })
  })

  it('rejects header lines with empty names', () => {
    expect(sanitizeForwardedHeaders(': value')).toEqual({
      header: ': value',
      ok: false,
      reason: 'invalid-header',
    })
  })
})
