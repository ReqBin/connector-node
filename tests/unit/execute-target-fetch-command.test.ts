import { afterEach, describe, expect, it, vi } from 'vitest'
import { ExecuteTargetFetchCommand } from '../../src/fetch/commands/ExecuteTargetFetchCommand.js'
import type { ExecutableFetchRequest } from '../../src/fetch/types.js'

const baseRequest: ExecutableFetchRequest = {
  headers: {
    Accept: 'application/json',
  },
  headersText: 'Accept: application/json',
  method: 'POST',
  url: new URL('https://api.example.test/resource'),
}

function decode(body: Uint8Array): string {
  return new TextDecoder().decode(body)
}

function createResponseStream(chunks: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(new TextEncoder().encode(chunk))
      }
      controller.close()
    },
  })
}

describe('ExecuteTargetFetchCommand', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('executes target requests with manual redirects and returns response data', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('accepted', {
      headers: {
        'content-type': 'text/plain',
        'x-target': 'ok',
      },
      status: 202,
      statusText: 'Accepted',
    }))
    const now = vi.fn().mockReturnValueOnce(1000).mockReturnValueOnce(1042)

    const result = await new ExecuteTargetFetchCommand({
      fetchImpl,
      now,
    }).execute({
      ...baseRequest,
      body: '{"ok":true}',
    })

    expect(fetchImpl).toHaveBeenCalledWith(baseRequest.url, {
      body: '{"ok":true}',
      headers: {
        Accept: 'application/json',
      },
      method: 'POST',
      redirect: 'manual',
      signal: expect.any(AbortSignal),
    })
    expect(result).toMatchObject({
      ok: true,
      response: {
        contentType: 'text/plain',
        elapsedMs: 42,
        headers: {
          'content-type': 'text/plain',
          'x-target': 'ok',
        },
        status: 202,
        statusText: 'Accepted',
      },
    })
    expect(result.ok && decode(result.response.body)).toBe('accepted')
  })

  it('supports empty response bodies', async () => {
    const result = await new ExecuteTargetFetchCommand({
      fetchImpl: vi.fn().mockResolvedValue(new Response(null)),
    }).execute(baseRequest)

    expect(result).toMatchObject({
      ok: true,
      response: {
        body: new Uint8Array(),
      },
    })
  })

  it('rejects oversized request bodies before calling fetch', async () => {
    const fetchImpl = vi.fn()

    const result = await new ExecuteTargetFetchCommand({
      fetchImpl,
      requestBodyLimitBytes: 2,
    }).execute({
      ...baseRequest,
      body: 'toolarge',
    })

    expect(fetchImpl).not.toHaveBeenCalled()
    expect(result).toEqual({
      code: 'request-body-too-large',
      message: 'Target request body exceeds the configured limit.',
      ok: false,
    })
  })

  it('rejects oversized response bodies while reading', async () => {
    const result = await new ExecuteTargetFetchCommand({
      fetchImpl: vi.fn().mockResolvedValue(new Response(createResponseStream(['too', 'large']))),
      responseBodyLimitBytes: 5,
    }).execute(baseRequest)

    expect(result).toEqual({
      code: 'response-body-too-large',
      message: 'Target response body exceeds the configured limit.',
      ok: false,
    })
  })

  it('maps target network failures', async () => {
    const result = await new ExecuteTargetFetchCommand({
      fetchImpl: vi.fn().mockRejectedValue(new Error('DNS failed')),
    }).execute(baseRequest)

    expect(result).toEqual({
      code: 'network-error',
      message: 'Target request failed.',
      ok: false,
    })
  })

  it('aborts the target request on timeout', async () => {
    vi.useFakeTimers()
    const fetchImpl = vi.fn((_url: string | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(new Error('aborted'))
      })
    }))
    const promise = new ExecuteTargetFetchCommand({
      fetchImpl,
      timeoutMs: 100,
    }).execute(baseRequest)

    await vi.advanceTimersByTimeAsync(100)

    await expect(promise).resolves.toEqual({
      code: 'timeout',
      message: 'Target request timed out.',
      ok: false,
    })
  })
})
