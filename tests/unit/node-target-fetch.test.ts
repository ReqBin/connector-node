import { EventEmitter } from 'node:events'
import { Readable } from 'node:stream'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getNodeResponseTimings, nodeTargetFetch } from '../../src/fetch/node-target-fetch.js'

const mocks = vi.hoisted(() => ({
  httpRequest: vi.fn(),
  httpsRequest: vi.fn(),
}))

vi.mock('node:http', () => ({
  default: {
    request: mocks.httpRequest,
  },
}))

vi.mock('node:https', () => ({
  default: {
    request: mocks.httpsRequest,
  },
}))

interface MockResponseOptions {
  body?: string
  emitConnect?: boolean
  emitFinish?: boolean
  emitLookup?: boolean
  emitSocket?: boolean
  headers?: Record<string, string | string[] | undefined>
  secure?: boolean
  statusCode?: number
  statusMessage?: string
}

function createRequestMock({
  body = 'accepted',
  emitConnect = true,
  emitFinish = true,
  emitLookup = true,
  emitSocket = true,
  headers = {},
  secure = false,
  statusCode = 200,
  statusMessage = 'OK',
}: MockResponseOptions = {}) {
  return vi.fn((_url: URL, _options: unknown, callback: (response: Readable) => void) => {
    const request = new EventEmitter() as EventEmitter & {
      destroy: (err: Error) => void
      end: (body?: Buffer) => void
    }
    request.destroy = (err: Error) => {
      request.emit('error', err)
    }
    request.end = () => {
      const socket = new EventEmitter()
      if (emitSocket) {
        request.emit('socket', socket)
      }
      if (emitLookup) {
        socket.emit('lookup')
      }
      if (emitConnect) {
        socket.emit('connect')
      }
      if (secure) {
        socket.emit('secureConnect')
      }
      if (emitFinish) {
        request.emit('finish')
      }

      const response = Readable.from(body.length === 0 ? [] : [Buffer.from(body)]) as Readable & {
        headers: Record<string, string | string[]>
        statusCode: number
        statusMessage: string
      }
      response.headers = headers
      response.statusCode = statusCode
      response.statusMessage = statusMessage
      callback(response)
    }

    return request
  })
}

function createPendingRequestMock() {
  return vi.fn(() => {
    const request = new EventEmitter() as EventEmitter & {
      destroy: (err: Error) => void
      end: () => void
    }
    request.destroy = (err: Error) => {
      request.emit('error', err)
    }
    request.end = () => undefined

    return request
  })
}

describe('nodeTargetFetch', () => {
  beforeEach(() => {
    mocks.httpRequest.mockReset()
    mocks.httpsRequest.mockReset()
  })

  it('executes HTTP requests and attaches measured phase timings', async () => {
    mocks.httpRequest.mockImplementation(createRequestMock({
      headers: {
        'content-type': 'text/plain',
        'set-cookie': ['a=1', 'b=2'],
        'x-missing': undefined,
      },
      statusCode: 201,
      statusMessage: 'Created',
    }))

    const response = await nodeTargetFetch('http://api.example.test/resource', {
      body: 'payload',
      headers: {
        Accept: 'text/plain',
      },
      method: 'POST',
    })

    expect(mocks.httpRequest).toHaveBeenCalledWith(new URL('http://api.example.test/resource'), {
      headers: {
        accept: 'text/plain',
      },
      method: 'POST',
    }, expect.any(Function))
    expect(response.status).toBe(201)
    expect(response.statusText).toBe('Created')
    expect(response.headers.get('set-cookie')).toBe('a=1, b=2')
    await expect(response.text()).resolves.toBe('accepted')
    expect(getNodeResponseTimings(response)).toMatchObject({
      connectingMs: expect.any(Number),
      dnsMs: expect.any(Number),
      sendingMs: expect.any(Number),
      waitingMs: expect.any(Number),
    })
  })

  it('uses HTTPS transport and records TLS timing when available', async () => {
    mocks.httpsRequest.mockImplementation(createRequestMock({
      secure: true,
    }))

    const response = await nodeTargetFetch(new URL('https://api.example.test/secure'))

    expect(mocks.httpsRequest).toHaveBeenCalled()
    expect(getNodeResponseTimings(response)).toMatchObject({
      tlsMs: expect.any(Number),
    })
  })

  it('supports Uint8Array request bodies and empty 204 responses', async () => {
    mocks.httpRequest.mockImplementation(createRequestMock({
      body: 'ignored',
      statusCode: 204,
      statusMessage: 'No Content',
    }))

    const response = await nodeTargetFetch(new URL('http://api.example.test/empty'), {
      body: new TextEncoder().encode('bytes'),
      method: 'POST',
    })

    expect(response.status).toBe(204)
    await expect(response.arrayBuffer()).resolves.toHaveProperty('byteLength', 0)
  })

  it('handles cached connection timing fallbacks and 304 empty responses', async () => {
    mocks.httpRequest.mockImplementation(createRequestMock({
      emitConnect: false,
      emitFinish: false,
      emitLookup: false,
      emitSocket: false,
      statusCode: 304,
      statusMessage: 'Not Modified',
    }))

    const response = await nodeTargetFetch(new URL('http://api.example.test/cached'))

    expect(response.status).toBe(304)
    await expect(response.arrayBuffer()).resolves.toHaveProperty('byteLength', 0)
    expect(getNodeResponseTimings(response)).toMatchObject({
      connectingMs: 0,
      dnsMs: 0,
      sendingMs: 0,
      tlsMs: 0,
      waitingMs: expect.any(Number),
    })
  })

  it('uses socket assignment as connect timing fallback when lookup is skipped', async () => {
    mocks.httpRequest.mockImplementation(createRequestMock({
      emitLookup: false,
    }))

    const response = await nodeTargetFetch(new URL('http://api.example.test/no-lookup'))

    expect(getNodeResponseTimings(response)).toMatchObject({
      connectingMs: expect.any(Number),
      dnsMs: 0,
    })
  })

  it('rejects unsupported request body types before sending', async () => {
    await expect(nodeTargetFetch(new URL('https://api.example.test'), {
      body: new Blob(['unsupported']),
    })).rejects.toThrow('Unsupported target request body type.')
    expect(mocks.httpsRequest).not.toHaveBeenCalled()
  })

  it('rejects aborted requests', async () => {
    mocks.httpRequest.mockImplementation(createPendingRequestMock())
    const controller = new AbortController()

    const promise = nodeTargetFetch(new URL('http://api.example.test/abort'), {
      signal: controller.signal,
    })
    controller.abort()

    await expect(promise).rejects.toThrow('aborted')
  })

  it('rejects requests that were already aborted', async () => {
    mocks.httpRequest.mockImplementation(createRequestMock())
    const controller = new AbortController()
    controller.abort()

    await expect(nodeTargetFetch(new URL('http://api.example.test/abort'), {
      signal: controller.signal,
    })).rejects.toThrow('aborted')
  })
})
