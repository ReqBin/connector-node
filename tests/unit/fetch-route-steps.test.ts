import { describe, expect, it, vi } from 'vitest'
import {
  executeFetchTargetStep,
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
})
