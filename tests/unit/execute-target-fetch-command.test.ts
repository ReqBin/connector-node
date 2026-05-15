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
    const now = vi.fn()
      .mockReturnValueOnce(1000)
      .mockReturnValueOnce(1020)
      .mockReturnValueOnce(1042)

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
        redirects: [],
        redirectsTimeMs: 0,
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

  it('follows browser-like redirects and records redirect timings', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(null, {
        headers: {
          location: '/next',
          'x-hop': 'first',
        },
        status: 302,
        statusText: 'Found',
      }))
      .mockResolvedValueOnce(new Response('done', {
        status: 200,
        statusText: 'OK',
      }))
    const now = vi.fn()
      .mockReturnValueOnce(1000)
      .mockReturnValueOnce(1025)
      .mockReturnValueOnce(1030)
      .mockReturnValueOnce(1080)
      .mockReturnValueOnce(1100)

    const result = await new ExecuteTargetFetchCommand({
      fetchImpl,
      now,
    }).execute({
      ...baseRequest,
      body: 'payload',
    })

    expect(fetchImpl).toHaveBeenNthCalledWith(1, baseRequest.url, expect.objectContaining({
      body: 'payload',
      method: 'POST',
    }))
    expect(fetchImpl).toHaveBeenNthCalledWith(2, new URL('https://api.example.test/next'), expect.objectContaining({
      body: undefined,
      method: 'GET',
    }))
    expect(result).toMatchObject({
      ok: true,
      response: {
        elapsedMs: 100,
        redirects: [{
          elapsedMs: 25,
          headers: {
            location: '/next',
            'x-hop': 'first',
          },
          status: 302,
          url: 'https://api.example.test/next',
        }],
        redirectsTimeMs: 25,
      },
    })
  })

  it('preserves request method and body for temporary redirects', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(null, {
        headers: {
          location: 'https://api.example.test/preserved',
        },
        status: 307,
      }))
      .mockResolvedValueOnce(new Response(null))

    await new ExecuteTargetFetchCommand({
      fetchImpl,
    }).execute({
      ...baseRequest,
      body: 'payload',
    })

    expect(fetchImpl).toHaveBeenNthCalledWith(2, new URL('https://api.example.test/preserved'), expect.objectContaining({
      body: 'payload',
      method: 'POST',
    }))
  })

  it('uses browser-like method conversion for see-other redirects', async () => {
    const putFetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(null, {
        headers: {
          location: 'https://api.example.test/see-other',
        },
        status: 303,
      }))
      .mockResolvedValueOnce(new Response(null))
    const headFetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(null, {
        headers: {
          location: 'https://api.example.test/head',
        },
        status: 303,
      }))
      .mockResolvedValueOnce(new Response(null))

    await new ExecuteTargetFetchCommand({
      fetchImpl: putFetchImpl,
    }).execute({
      ...baseRequest,
      body: 'payload',
      headers: {
        'Content-Type': 'text/plain',
      },
      method: 'PUT',
    })
    await new ExecuteTargetFetchCommand({
      fetchImpl: headFetchImpl,
    }).execute({
      ...baseRequest,
      method: 'HEAD',
    })

    expect(putFetchImpl).toHaveBeenNthCalledWith(2, new URL('https://api.example.test/see-other'), expect.objectContaining({
      body: undefined,
      headers: {},
      method: 'GET',
    }))
    expect(headFetchImpl).toHaveBeenNthCalledWith(2, new URL('https://api.example.test/head'), expect.objectContaining({
      body: undefined,
      method: 'HEAD',
    }))
  })

  it('treats redirects without a usable location as final responses', async () => {
    const missingLocationResult = await new ExecuteTargetFetchCommand({
      fetchImpl: vi.fn().mockResolvedValue(new Response(null, {
        status: 302,
      })),
    }).execute(baseRequest)
    const blankLocationResult = await new ExecuteTargetFetchCommand({
      fetchImpl: vi.fn().mockResolvedValue(new Response(null, {
        headers: {
          location: ' ',
        },
        status: 302,
      })),
    }).execute(baseRequest)

    expect(missingLocationResult).toMatchObject({
      ok: true,
      response: {
        redirects: [],
        status: 302,
      },
    })
    expect(blankLocationResult).toMatchObject({
      ok: true,
      response: {
        redirects: [],
        status: 302,
      },
    })
  })

  it('rejects redirect chains that exceed the configured limit', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, {
      headers: {
        location: 'https://api.example.test/next',
      },
      status: 302,
    }))

    const result = await new ExecuteTargetFetchCommand({
      fetchImpl,
    }).execute(baseRequest)

    expect(fetchImpl).toHaveBeenCalledTimes(11)
    expect(result).toEqual({
      code: 'too-many-redirects',
      message: 'Target redirect chain exceeds the configured limit.',
      ok: false,
    })
  })

  it('rejects redirects to blocked connector targets', async () => {
    const result = await new ExecuteTargetFetchCommand({
      fetchImpl: vi.fn().mockResolvedValue(new Response(null, {
        headers: {
          location: 'http://169.254.169.254/latest/meta-data',
        },
        status: 302,
      })),
    }).execute(baseRequest)

    expect(result).toEqual({
      code: 'blocked-redirect',
      message: 'Redirect target host is blocked by connector policy.',
      ok: false,
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
