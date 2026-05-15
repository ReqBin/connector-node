import { describe, expect, it } from 'vitest'
import { ParseFetchPayloadCommand } from '../../src/fetch/commands/ParseFetchPayloadCommand.js'

async function parse(envelope: unknown) {
  return new ParseFetchPayloadCommand().execute(envelope)
}

describe('ParseFetchPayloadCommand', () => {
  it('parses the ReqBin json envelope', async () => {
    const result = await parse({
      json: JSON.stringify({
        content: '{"ok":true}',
        contentType: 'JSON',
        headers: 'Accept: application/json\nX-Test: yes',
        method: 'post',
        url: 'https://api.example.test/users',
      }),
    })

    expect(result).toMatchObject({
      ok: true,
      request: {
        body: '{"ok":true}',
        contentType: 'JSON',
        headersText: 'Accept: application/json\nX-Test: yes',
        method: 'POST',
      },
    })
    expect(result.ok && result.request.url.href).toBe('https://api.example.test/users')
  })

  it('accepts decoded json objects and prefers idnUrl over url', async () => {
    const result = await parse({
      json: {
        idnUrl: 'https://idn.example.test',
        url: 'https://fallback.example.test',
      },
    })

    expect(result).toMatchObject({
      ok: true,
      request: {
        headersText: '',
        method: 'GET',
      },
    })
    expect(result.ok && result.request.url.href).toBe('https://idn.example.test/')
  })

  it('rejects non-object envelopes', async () => {
    await expect(parse(null)).resolves.toEqual({
      code: 'invalid-envelope',
      message: 'Request body must be a JSON object.',
      ok: false,
    })
  })

  it('rejects missing json payloads', async () => {
    await expect(parse({})).resolves.toEqual({
      code: 'invalid-envelope',
      message: 'Request body must include a json payload.',
      ok: false,
    })
  })

  it('rejects malformed inner json strings', async () => {
    await expect(parse({ json: '{' })).resolves.toEqual({
      code: 'malformed-json',
      message: 'Request json payload is malformed.',
      ok: false,
    })
  })

  it('rejects decoded json values that are not objects', async () => {
    await expect(parse({ json: '[]' })).resolves.toEqual({
      code: 'invalid-envelope',
      message: 'Decoded json payload must be an object.',
      ok: false,
    })
  })

  it('rejects invalid methods', async () => {
    await expect(parse({
      json: {
        method: 'TRACE',
        url: 'https://api.example.test',
      },
    })).resolves.toEqual({
      code: 'invalid-method',
      message: 'Unsupported HTTP method: TRACE.',
      ok: false,
    })
  })

  it('rejects missing target URLs', async () => {
    await expect(parse({
      json: {
        method: 'GET',
      },
    })).resolves.toEqual({
      code: 'missing-url',
      message: 'Target URL is required.',
      ok: false,
    })
  })

  it('rejects invalid target URLs', async () => {
    await expect(parse({
      json: {
        url: 'not a url',
      },
    })).resolves.toEqual({
      code: 'invalid-url',
      message: 'Target URL is invalid.',
      ok: false,
    })
  })

  it('rejects unsupported target URL schemes', async () => {
    await expect(parse({
      json: {
        url: 'file:///etc/passwd',
      },
    })).resolves.toEqual({
      code: 'unsupported-scheme',
      message: 'Target URL must use http or https.',
      ok: false,
    })
  })

  it('omits request bodies for GET and NOBODY requests', async () => {
    const getResult = await parse({
      json: {
        content: 'ignored',
        method: 'GET',
        url: 'https://api.example.test',
      },
    })
    const nobodyResult = await parse({
      json: {
        content: 'ignored',
        contentType: 'NOBODY',
        method: 'POST',
        url: 'https://api.example.test',
      },
    })

    expect(getResult.ok && getResult.request.body).toBeUndefined()
    expect(nobodyResult.ok && nobodyResult.request.body).toBeUndefined()
  })

  it('stringifies non-string request content for body-capable methods', async () => {
    const result = await parse({
      json: {
        content: 42,
        method: 'PUT',
        url: 'https://api.example.test',
      },
    })

    expect(result.ok && result.request.body).toBe('42')
  })
})
