import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { readFileSync } from 'node:fs'
import { createApp } from '../../src/http/app.js'
import { createConnectorInfo, createDefaultConnectorInfo, readConnectorPackageJson } from '../../src/http/connector-info.js'
import { MemoryPairingStore } from '../../src/security/pairing.js'

const packageJson = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
  name: string
  version: string
}

let app: FastifyInstance | undefined
let consoleLog: ReturnType<typeof vi.spyOn>

async function createTestApp() {
  app = await createApp()
  return app
}

describe('Fastify app factory', () => {
  beforeEach(() => {
    consoleLog = vi.spyOn(console, 'log').mockImplementation(() => undefined)
  })

  afterEach(async () => {
    await app?.close()
    app = undefined
    consoleLog.mockRestore()
  })

  it('creates a Fastify app with the health route', async () => {
    const testApp = await createTestApp()

    const response = await testApp.inject({
      method: 'GET',
      url: '/health',
    })

    expect(response.statusCode).toBe(200)
    expect(response.headers['correlation-id']).toEqual(expect.any(String))
    expect(response.headers['content-type']).toContain('application/json')
    expect(response.json()).toEqual({ status: 'up' })
  })

  it('propagates provided correlation ids', async () => {
    const testApp = await createTestApp()

    const response = await testApp.inject({
      headers: {
        'correlation-id': 'reqbin-test-correlation',
      },
      method: 'GET',
      url: '/health',
    })

    expect(response.statusCode).toBe(200)
    expect(response.headers['correlation-id']).toBe('reqbin-test-correlation')
  })

  it('writes structured request logs with correlation ids', async () => {
    const testApp = await createTestApp()

    await testApp.inject({
      headers: {
        'correlation-id': 'reqbin-test-correlation',
      },
      method: 'GET',
      url: '/health',
    })

    const entries = consoleLog.mock.calls.map(([entry]) => JSON.parse(String(entry)))

    expect(entries).toEqual([
      {
        correlationId: 'reqbin-test-correlation',
        event: 'reqbin.connector.request.started',
        hasQuery: false,
        method: 'GET',
        url: '/health',
      },
      {
        correlationId: 'reqbin-test-correlation',
        elapsedMs: expect.any(Number),
        event: 'reqbin.connector.request.finished',
        hasQuery: false,
        method: 'GET',
        statusCode: 200,
        url: '/health',
      },
    ])
  })

  it('does not log incoming request query values', async () => {
    const testApp = await createTestApp()

    await testApp.inject({
      headers: {
        'correlation-id': 'reqbin-test-correlation',
      },
      method: 'GET',
      url: '/health?token=secret',
    })

    const entries = consoleLog.mock.calls.map(([entry]) => JSON.parse(String(entry)))

    expect(entries).toEqual([
      expect.objectContaining({
        hasQuery: true,
        url: '/health',
      }),
      expect.objectContaining({
        hasQuery: true,
        url: '/health',
      }),
    ])
    expect(JSON.stringify(entries)).not.toContain('secret')
  })

  it('allows CORS requests from default ReqBin origins', async () => {
    const testApp = await createTestApp()

    const response = await testApp.inject({
      headers: {
        origin: 'https://reqbin.com',
      },
      method: 'GET',
      url: '/health',
    })

    expect(response.statusCode).toBe(200)
    expect(response.headers['access-control-allow-origin']).toBe('https://reqbin.com')
    expect(response.headers['access-control-expose-headers']).toBe('correlation-id')
  })

  it('does not emit permissive CORS headers for denied origins', async () => {
    const testApp = await createTestApp()

    const response = await testApp.inject({
      headers: {
        origin: 'https://example.test',
      },
      method: 'GET',
      url: '/health',
    })

    expect(response.statusCode).toBe(200)
    expect(response.headers['access-control-allow-origin']).toBeUndefined()
  })

  it('does not emit permissive CORS headers for denied preflight requests', async () => {
    const testApp = await createTestApp()

    const response = await testApp.inject({
      headers: {
        'access-control-request-headers': 'authorization,cache-control,content-type,correlation-id,expires,pragma,x-authorized,x-devid,x-sesid,x-token',
        'access-control-request-method': 'POST',
        origin: 'https://example.test',
      },
      method: 'OPTIONS',
      url: '/v1/fetch',
    })

    expect(response.statusCode).toBe(404)
    expect(response.headers['access-control-allow-origin']).toBeUndefined()
    expect(response.headers['access-control-allow-headers']).toBeUndefined()
  })

  it('does not emit CORS headers when origin is absent', async () => {
    const testApp = await createTestApp()

    const response = await testApp.inject({
      method: 'GET',
      url: '/health',
    })

    expect(response.statusCode).toBe(200)
    expect(response.headers['access-control-allow-origin']).toBeUndefined()
  })

  it('allows configured development CORS origins', async () => {
    app = await createApp({
      cors: {
        allowDevOrigins: true,
      },
    })

    const response = await app.inject({
      headers: {
        'access-control-request-headers': 'authorization,cache-control,content-type,correlation-id,expires,pragma,x-authorized,x-devid,x-sesid,x-token',
        'access-control-request-method': 'POST',
        origin: 'http://localhost:5173',
      },
      method: 'OPTIONS',
      url: '/v1/fetch',
    })

    expect(response.statusCode).toBe(204)
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173')
    expect(response.headers['access-control-allow-headers']).toBe('authorization, cache-control, content-type, correlation-id, expires, pragma, x-authorized, x-devid, x-sesid, x-token')
    expect(response.headers['access-control-allow-methods']).toBe('GET, POST, OPTIONS')
  })

  it('extends CORS allowlist with explicit origins', async () => {
    app = await createApp({
      cors: {
        allowedOrigins: ['http://localhost:8080'],
      },
    })

    const response = await app.inject({
      headers: {
        origin: 'http://localhost:8080',
      },
      method: 'GET',
      url: '/health',
    })

    expect(response.statusCode).toBe(200)
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:8080')
  })

  it('returns default connector version metadata', async () => {
    const testApp = await createTestApp()

    const response = await testApp.inject({
      method: 'GET',
      url: '/version',
    })

    expect(response.statusCode).toBe(200)
    expect(response.headers['correlation-id']).toEqual(expect.any(String))
    expect(response.json()).toEqual({
      name: packageJson.name,
      protocolVersion: 'v1',
      version: packageJson.version,
    })
    expect(createDefaultConnectorInfo()).toEqual(response.json())
  })

  it('allows connector metadata to be injected', async () => {
    const connectorInfo = {
      name: '@reqbin/connector-test',
      protocolVersion: 'v1',
      version: '9.9.9',
    }
    app = await createApp({ connectorInfo })

    const response = await app.inject({
      method: 'GET',
      url: '/version',
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual(connectorInfo)
  })

  it('pairs a valid terminal code without exposing the code', async () => {
    const pairingStore = new MemoryPairingStore({
      codeGenerator: () => '123456',
      tokenGenerator: () => 'paired-token',
    })
    app = await createApp({
      pairingStore,
    })

    const pairResponse = await app.inject({
      body: {
        code: '123456',
      },
      method: 'POST',
      url: '/v1/pair',
    })
    const getResponse = await app.inject({
      method: 'GET',
      url: '/v1/pair',
    })

    expect(pairResponse.statusCode).toBe(200)
    expect(pairResponse.json()).toEqual({
      token: 'paired-token',
      tokenType: 'Bearer',
    })
    expect(pairingStore.hasToken('paired-token')).toBe(true)
    expect(getResponse.statusCode).toBe(404)
    expect(getResponse.body).not.toContain('123456')
  })

  it('rejects invalid pairing codes', async () => {
    app = await createApp({
      pairingStore: new MemoryPairingStore({
        codeGenerator: () => '123456',
      }),
    })

    const response = await app.inject({
      body: {
        code: '000000',
      },
      method: 'POST',
      url: '/v1/pair',
    })

    expect(response.statusCode).toBe(401)
    expect(response.json()).toEqual({
      error: 'invalid-code',
      message: 'Pairing failed.',
    })
  })

  it('rejects expired pairing codes', async () => {
    let now = 1000
    app = await createApp({
      pairingStore: new MemoryPairingStore({
        codeGenerator: () => '123456',
        now: () => now,
        ttlMs: 10,
      }),
    })
    now = 1010

    const response = await app.inject({
      body: {
        code: '123456',
      },
      method: 'POST',
      url: '/v1/pair',
    })

    expect(response.statusCode).toBe(401)
    expect(response.json()).toEqual({
      error: 'expired',
      message: 'Pairing failed.',
    })
  })

  it('rejects pairing after the attempt limit', async () => {
    app = await createApp({
      pairingStore: new MemoryPairingStore({
        codeGenerator: () => '123456',
        maxAttempts: 1,
      }),
    })

    await app.inject({
      body: {
        code: '000000',
      },
      method: 'POST',
      url: '/v1/pair',
    })
    const response = await app.inject({
      body: {
        code: '123456',
      },
      method: 'POST',
      url: '/v1/pair',
    })

    expect(response.statusCode).toBe(429)
    expect(response.json()).toEqual({
      error: 'attempt-limit',
      message: 'Pairing failed.',
    })
  })

  it('rejects malformed pairing payloads before pairing', async () => {
    app = await createApp({
      pairingStore: new MemoryPairingStore({
        codeGenerator: () => '123456',
      }),
    })

    const response = await app.inject({
      body: {
        code: 'abc',
      },
      method: 'POST',
      url: '/v1/pair',
    })

    expect(response.statusCode).toBe(400)
  })

  it('rejects fetch requests without a bearer token by default', async () => {
    const pairingStore = new MemoryPairingStore({
      codeGenerator: () => '123456',
    })
    app = await createApp({
      pairingStore,
    })

    const response = await app.inject({
      body: {},
      method: 'POST',
      url: '/v1/fetch',
    })

    expect(response.statusCode).toBe(401)
    expect(response.json()).toEqual({
      error: 'missing-token',
      message: 'Authentication failed.',
    })
  })

  it('rejects fetch requests with an invalid bearer token', async () => {
    const pairingStore = new MemoryPairingStore({
      codeGenerator: () => '123456',
    })
    app = await createApp({
      pairingStore,
    })

    const response = await app.inject({
      body: {},
      headers: {
        authorization: 'Bearer invalid-token',
      },
      method: 'POST',
      url: '/v1/fetch',
    })

    expect(response.statusCode).toBe(401)
    expect(response.json()).toEqual({
      error: 'invalid-token',
      message: 'Authentication failed.',
    })
  })

  it('allows fetch route access with a paired bearer token', async () => {
    const pairingStore = new MemoryPairingStore({
      codeGenerator: () => '123456',
      tokenGenerator: () => 'paired-token',
    })
    pairingStore.pair('123456')
    app = await createApp({
      pairingStore,
      targetFetch: vi.fn().mockResolvedValue(new Response(null)),
    })

    const response = await app.inject({
      body: {
        json: JSON.stringify({
          method: 'GET',
          url: 'https://api.example.test',
        }),
      },
      headers: {
        authorization: 'Bearer paired-token',
      },
      method: 'POST',
      url: '/v1/fetch',
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      StatusCode: '200',
      Success: true,
    })
  })

  it('allows fetch route access when auth is explicitly disabled', async () => {
    app = await createApp({
      auth: {
        authDisabled: true,
      },
      targetFetch: vi.fn().mockResolvedValue(new Response(null)),
    })

    const response = await app.inject({
      body: {
        json: JSON.stringify({
          method: 'GET',
          url: 'https://api.example.test',
        }),
      },
      method: 'POST',
      url: '/v1/fetch',
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      StatusCode: '200',
      Success: true,
    })
  })

  it('accepts connector request envelopes above the Fastify default body limit', async () => {
    const content = 'a'.repeat(1024 * 1024 + 1)
    const targetFetch = vi.fn().mockResolvedValue(new Response(null))
    app = await createApp({
      auth: {
        authDisabled: true,
      },
      targetFetch,
    })

    const response = await app.inject({
      body: {
        json: JSON.stringify({
          content,
          contentType: 'CUSTOM',
          method: 'POST',
          url: 'https://api.example.test',
        }),
      },
      method: 'POST',
      url: '/v1/fetch',
    })

    expect(response.statusCode).toBe(200)
    expect(targetFetch).toHaveBeenCalledWith(new URL('https://api.example.test/'), expect.objectContaining({
      body: content,
    }))
  })

  it('passes configured target fetch limits into the fetch pipeline', async () => {
    app = await createApp({
      auth: {
        authDisabled: true,
      },
      targetFetchOptions: {
        requestBodyLimitBytes: 3,
      },
    })

    const response = await app.inject({
      body: {
        json: JSON.stringify({
          content: '1234',
          contentType: 'CUSTOM',
          method: 'POST',
          url: 'https://api.example.test',
        }),
      },
      method: 'POST',
      url: '/v1/fetch',
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      Content: 'Target request body exceeds the configured limit.',
      StatusCode: '0',
      Success: false,
    })
  })

  it('rejects malformed fetch payloads after auth succeeds', async () => {
    const pairingStore = new MemoryPairingStore({
      codeGenerator: () => '123456',
      tokenGenerator: () => 'paired-token',
    })
    pairingStore.pair('123456')
    app = await createApp({
      pairingStore,
    })

    const response = await app.inject({
      body: {
        json: '{',
      },
      headers: {
        authorization: 'Bearer paired-token',
      },
      method: 'POST',
      url: '/v1/fetch',
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({
      error: 'malformed-json',
      message: 'Request json payload is malformed.',
    })
  })

  it('rejects fetch payloads without target URLs after auth succeeds', async () => {
    const pairingStore = new MemoryPairingStore({
      codeGenerator: () => '123456',
      tokenGenerator: () => 'paired-token',
    })
    pairingStore.pair('123456')
    app = await createApp({
      pairingStore,
    })

    const response = await app.inject({
      body: {
        json: JSON.stringify({
          method: 'GET',
        }),
      },
      headers: {
        authorization: 'Bearer paired-token',
      },
      method: 'POST',
      url: '/v1/fetch',
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({
      error: 'missing-url',
      message: 'Target URL is required.',
    })
  })

  it('rejects fetch payloads with unsupported target schemes after auth succeeds', async () => {
    app = await createApp({
      auth: {
        authDisabled: true,
      },
    })

    const response = await app.inject({
      body: {
        json: JSON.stringify({
          url: 'file:///etc/passwd',
        }),
      },
      method: 'POST',
      url: '/v1/fetch',
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({
      error: 'unsupported-scheme',
      message: 'Target URL must use http or https.',
    })
  })

  it('rejects fetch payloads for blocked target hosts after auth succeeds', async () => {
    app = await createApp({
      auth: {
        authDisabled: true,
      },
    })

    const response = await app.inject({
      body: {
        json: JSON.stringify({
          url: 'http://169.254.169.254/latest/meta-data',
        }),
      },
      method: 'POST',
      url: '/v1/fetch',
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({
      error: 'blocked-host',
      message: 'Target host is blocked by connector policy.',
    })
  })

  it('rejects malformed forwarded headers after auth succeeds', async () => {
    app = await createApp({
      auth: {
        authDisabled: true,
      },
    })

    const response = await app.inject({
      body: {
        json: JSON.stringify({
          headers: 'Accept: application/json\nBroken Header',
          url: 'https://api.example.test',
        }),
      },
      method: 'POST',
      url: '/v1/fetch',
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({
      error: 'invalid-header',
      message: 'Forwarded header block contains an invalid header.',
    })
  })

  it('allows fetch payloads with headers that can be safely stripped', async () => {
    const targetFetch = vi.fn().mockResolvedValue(new Response('target ok', {
      headers: {
        'content-type': 'text/plain',
      },
      status: 201,
      statusText: 'Created',
    }))
    app = await createApp({
      auth: {
        authDisabled: true,
      },
      targetFetch,
    })

    const response = await app.inject({
      body: {
        json: JSON.stringify({
          headers: 'Host: api.example.test\nContent-Length: 12\nAccept: application/json',
          url: 'https://api.example.test',
        }),
      },
      method: 'POST',
      url: '/v1/fetch',
    })

    expect(targetFetch).toHaveBeenCalledWith(new URL('https://api.example.test/'), {
      body: undefined,
      headers: {
        Accept: 'application/json',
      },
      method: 'GET',
      redirect: 'manual',
      signal: expect.any(AbortSignal),
    })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      Content: 'target ok',
      ContentLength: 9,
      ContentType: 'text/plain',
      StatusCode: '201',
      StatusDescription: 'Created',
      Success: true,
    })
  })

  it('returns target execution failures through the sender response contract', async () => {
    app = await createApp({
      auth: {
        authDisabled: true,
      },
      targetFetch: vi.fn().mockRejectedValue(new Error('DNS failed')),
    })

    const response = await app.inject({
      body: {
        json: JSON.stringify({
          url: 'https://api.example.test',
        }),
      },
      method: 'POST',
      url: '/v1/fetch',
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      Content: 'Target request failed.',
      StatusCode: '0',
      StatusDescription: 'Error',
      Success: false,
    })
  })

  it('builds connector metadata with defaults for invalid package fields', () => {
    expect(createConnectorInfo({
      name: '',
      version: undefined,
    })).toEqual({
      name: '@reqbin/connector',
      protocolVersion: 'v1',
      version: '0.0.0',
    })
  })

  it('reads package metadata from the fallback source layout path', () => {
    expect(readConnectorPackageJson([
      './missing-package.json',
      '../../package.json',
    ])).toEqual(packageJson)
  })

  it('fails when package metadata cannot be found', () => {
    expect(() => readConnectorPackageJson([
      './missing-package.json',
    ])).toThrow('Unable to read connector package metadata.')
  })

  it('generates OpenAPI JSON for registered routes', async () => {
    const testApp = await createTestApp()

    const response = await testApp.inject({
      method: 'GET',
      url: '/openapi.json',
    })

    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toContain('application/json')
    expect(response.json()).toMatchObject({
      info: {
        title: 'ReqBin Connector API',
        version: packageJson.version,
      },
      openapi: '3.0.3',
      paths: {
        '/health': {},
        '/openapi.json': {},
        '/v1/fetch': {},
        '/v1/pair': {},
        '/version': {},
      },
    })
  })
})
