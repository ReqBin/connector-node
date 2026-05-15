import { describe, expect, it, vi } from 'vitest'
import {
  authorizeFetchRouteStep,
  executeFetchTargetStep,
  parseFetchPayloadStep,
  sanitizeFetchHeadersStep,
  validateFetchTargetStep,
  type FetchRouteChainContext,
} from '../../src/http/routes/fetch.steps.js'

function createReply() {
  return {
    code: vi.fn().mockReturnThis(),
    send: vi.fn(),
  }
}

function createBaseContext(): FetchRouteChainContext {
  return {
    reply: createReply() as never,
    request: {
      body: {},
      headers: {},
      id: 'test-correlation-id',
    } as never,
    route: {
      auth: {
        authDisabled: true,
      },
      connectorInfo: {
        name: '@reqbin/connector-test',
        protocolVersion: 'v1',
        version: '0.0.0',
      },
      pairingStore: {
        getPairingCode: vi.fn(),
        hasToken: vi.fn(),
        pair: vi.fn(),
      },
      targetFetch: vi.fn().mockResolvedValue(new Response(null, {
        status: 204,
        statusText: 'No Content',
      })),
    } as never,
  }
}

describe('fetch route chain steps', () => {
  it('fails clearly when target validation runs before payload parsing', async () => {
    await expect(validateFetchTargetStep(vi.fn(), createBaseContext())).rejects.toThrow(
      'Fetch route payload must be parsed before this step.',
    )
  })

  it('fails clearly when header sanitization runs before payload parsing', async () => {
    await expect(sanitizeFetchHeadersStep(vi.fn(), createBaseContext())).rejects.toThrow(
      'Fetch route payload must be parsed before this step.',
    )
  })

  it('fails clearly when target execution runs before header sanitization', async () => {
    const context = createBaseContext()
    context.parsed = {
      ok: true,
      request: {
        headersText: '',
        method: 'GET',
        url: new URL('https://api.example.test'),
      },
    }

    await expect(executeFetchTargetStep(vi.fn(), context)).rejects.toThrow(
      'Fetch route headers must be sanitized before this step.',
    )
  })

  it('logs target request lifecycle without query values', async () => {
    const execute = vi.fn()
    const logger = vi.fn()
    const context = createBaseContext()
    context.route.logger = logger
    context.parsed = {
      ok: true,
      request: {
        headersText: '',
        method: 'GET',
        url: new URL('https://api.example.test/search?token=secret'),
      },
    }
    context.headers = {
      headers: {},
      ok: true,
      strippedHeaders: [],
    }

    await executeFetchTargetStep(execute, context)

    expect(logger).toHaveBeenCalledWith({
      correlationId: 'test-correlation-id',
      event: 'reqbin.connector.target.started',
      hasQuery: true,
      method: 'GET',
      target: 'https://api.example.test/search',
    })
    expect(logger).toHaveBeenCalledWith({
      correlationId: 'test-correlation-id',
      elapsedMs: expect.any(Number),
      event: 'reqbin.connector.target.finished',
      hasQuery: true,
      method: 'GET',
      statusCode: 204,
      target: 'https://api.example.test/search',
    })
    expect(execute).toHaveBeenCalledWith(context)
  })

  it('logs target request failures', async () => {
    const logger = vi.fn()
    const context = createBaseContext()
    context.route.logger = logger
    context.route.targetFetch = vi.fn().mockRejectedValue(new Error('network failed'))
    context.parsed = {
      ok: true,
      request: {
        headersText: '',
        method: 'GET',
        url: new URL('https://api.example.test/fail'),
      },
    }
    context.headers = {
      headers: {},
      ok: true,
      strippedHeaders: [],
    }

    await executeFetchTargetStep(vi.fn(), context)

    expect(logger).toHaveBeenCalledWith({
      correlationId: 'test-correlation-id',
      elapsedMs: expect.any(Number),
      event: 'reqbin.connector.target.failed',
      hasQuery: false,
      method: 'GET',
      target: 'https://api.example.test/fail',
    })
  })

  it('logs authentication failures without token values', async () => {
    const logger = vi.fn()
    const context = createBaseContext()
    context.route.auth = undefined
    context.route.logger = logger

    await authorizeFetchRouteStep(vi.fn(), context)

    expect(logger).toHaveBeenCalledWith({
      correlationId: 'test-correlation-id',
      event: 'reqbin.connector.fetch.validation_failed',
      reason: 'missing-token',
      stage: 'auth',
    })
    expect(JSON.stringify(logger.mock.calls)).not.toContain('Bearer')
  })

  it('logs payload validation failures without payload values', async () => {
    const logger = vi.fn()
    const context = createBaseContext()
    context.route.logger = logger
    context.request.body = {
      json: '{"secret"',
    }

    await parseFetchPayloadStep(vi.fn(), context)

    expect(logger).toHaveBeenCalledWith({
      correlationId: 'test-correlation-id',
      event: 'reqbin.connector.fetch.validation_failed',
      reason: 'malformed-json',
      stage: 'payload',
    })
    expect(JSON.stringify(logger.mock.calls)).not.toContain('secret')
  })

  it('logs target policy failures without target query values', async () => {
    const logger = vi.fn()
    const context = createBaseContext()
    context.route.logger = logger
    context.parsed = {
      ok: true,
      request: {
        headersText: '',
        method: 'GET',
        url: new URL('http://169.254.169.254/latest?token=secret'),
      },
    }

    await validateFetchTargetStep(vi.fn(), context)

    expect(logger).toHaveBeenCalledWith({
      correlationId: 'test-correlation-id',
      event: 'reqbin.connector.fetch.validation_failed',
      reason: 'blocked-host',
      stage: 'target-policy',
    })
    expect(JSON.stringify(logger.mock.calls)).not.toContain('secret')
  })

  it('logs forwarded header validation failures without header values', async () => {
    const logger = vi.fn()
    const context = createBaseContext()
    context.route.logger = logger
    context.parsed = {
      ok: true,
      request: {
        headersText: 'Broken secret',
        method: 'GET',
        url: new URL('https://api.example.test'),
      },
    }

    await sanitizeFetchHeadersStep(vi.fn(), context)

    expect(logger).toHaveBeenCalledWith({
      correlationId: 'test-correlation-id',
      event: 'reqbin.connector.fetch.validation_failed',
      reason: 'invalid-header',
      stage: 'headers',
    })
    expect(JSON.stringify(logger.mock.calls)).not.toContain('secret')
  })

  it('logs stripped forwarded headers as warning without header values', async () => {
    const execute = vi.fn()
    const logger = vi.fn()
    const context = createBaseContext()
    context.route.logger = logger
    context.parsed = {
      ok: true,
      request: {
        headersText: 'Host: secret.example\nContent-Length: 123\nAccept: application/json',
        method: 'GET',
        url: new URL('https://api.example.test'),
      },
    }

    await sanitizeFetchHeadersStep(execute, context)

    expect(logger).toHaveBeenCalledWith({
      correlationId: 'test-correlation-id',
      event: 'reqbin.connector.forwarded_headers.stripped',
      headers: ['content-length', 'host'],
      level: 'warning',
    })
    expect(JSON.stringify(logger.mock.calls)).not.toContain('secret.example')
    expect(execute).toHaveBeenCalledWith(context)
  })
})
