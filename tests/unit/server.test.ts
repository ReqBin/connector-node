import { Readable } from 'node:stream'
import http from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { startServer } from '../../src/index.js'
import { createServer, handleRequest } from '../../src/server.js'

type RequestBody = string | Buffer | Array<string | Buffer>

interface InvokeOptions {
  body?: RequestBody
  headers?: http.IncomingHttpHeaders
  method?: string
  url?: string
}

interface MockResponse {
  body: string
  headers: Record<string, string>
  statusCode: number
  end: (chunk?: string) => void
  setHeader: (name: string, value: number | string | string[]) => void
  writeHead: (statusCode: number, headers?: Record<string, string>) => void
}

function makeRequest({ body = '', headers = {}, method = 'POST', url = '/proxy' }: InvokeOptions = {}): http.IncomingMessage {
  const chunks = Array.isArray(body) ? body : [body]
  const stream = Readable.from(chunks)

  Object.assign(stream, {
    headers,
    method,
    url,
  })

  return stream as http.IncomingMessage
}

function makeResponse(): http.ServerResponse & MockResponse {
  const response: MockResponse = {
    body: '',
    headers: {},
    statusCode: 200,
    end(chunk?: string) {
      if (chunk) {
        this.body += chunk
      }
    },
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = Array.isArray(value) ? value.join(', ') : String(value)
    },
    writeHead(statusCode, headers = {}) {
      this.statusCode = statusCode
      for (const [name, value] of Object.entries(headers)) {
        this.setHeader(name, value)
      }
    },
  }

  return response as http.ServerResponse & MockResponse
}

async function invoke(options?: InvokeOptions): Promise<MockResponse> {
  const req = makeRequest(options)
  const res = makeResponse()

  await handleRequest(req, res)

  return res
}

function parseJsonBody(res: MockResponse): Record<string, unknown> {
  return JSON.parse(res.body) as Record<string, unknown>
}

function mockServerListen() {
  return vi.spyOn(http.Server.prototype, 'listen').mockImplementation(function mockedListen(
    this: http.Server,
    ...args: unknown[]
  ) {
    const callback = args.find((arg): arg is () => void => typeof arg === 'function')
    callback?.()

    return this
  } as http.Server['listen'])
}

describe('server request handler', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('creates an HTTP server with the exported handler', () => {
    const server = createServer()

    try {
      expect(server.listeners('request')).toHaveLength(1)
    } finally {
      server.close()
    }
  })

  it('starts the server with the configured port', async () => {
    const listen = mockServerListen()
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)

    const server = await startServer({ port: 8181 })

    expect(listen).toHaveBeenCalledWith(8181, expect.any(Function))
    expect(log).toHaveBeenCalledWith('Local proxy: http://localhost:8181/proxy')
    expect(server).toBeInstanceOf(http.Server)
  })

  it('uses PORT when startServer is called without an explicit port', async () => {
    const originalPort = process.env.PORT
    process.env.PORT = '9090'
    const listen = mockServerListen()
    vi.spyOn(console, 'log').mockImplementation(() => undefined)

    try {
      await startServer()
    } finally {
      if (originalPort === undefined) {
        delete process.env.PORT
      } else {
        process.env.PORT = originalPort
      }
    }

    expect(listen).toHaveBeenCalledWith(9090, expect.any(Function))
  })

  it('uses port 7070 when no explicit port or PORT environment is set', async () => {
    const originalPort = process.env.PORT
    delete process.env.PORT
    const listen = mockServerListen()
    vi.spyOn(console, 'log').mockImplementation(() => undefined)

    try {
      await startServer()
    } finally {
      if (originalPort !== undefined) {
        process.env.PORT = originalPort
      }
    }

    expect(listen).toHaveBeenCalledWith(7070, expect.any(Function))
  })

  it('answers CORS preflight requests', async () => {
    const res = await invoke({
      headers: {
        'access-control-request-headers': 'x-requested-with',
        'access-control-request-method': 'PATCH',
      },
      method: 'OPTIONS',
    })

    expect(res.statusCode).toBe(204)
    expect(res.body).toBe('')
    expect(res.headers['access-control-allow-origin']).toBe('*')
    expect(res.headers['access-control-allow-methods']).toBe('PATCH')
    expect(res.headers['access-control-allow-headers']).toBe('x-requested-with')
  })

  it('rejects unknown routes', async () => {
    const res = await invoke({ url: '/unknown' })

    expect(res.statusCode).toBe(404)
    expect(parseJsonBody(res)).toMatchObject({
      Error: 'Not found. Use POST /proxy',
      Success: false,
    })
  })

  it('rejects non-POST proxy requests', async () => {
    const res = await invoke({ method: 'GET' })

    expect(res.statusCode).toBe(405)
    expect(parseJsonBody(res)).toMatchObject({
      Error: 'Only POST is allowed.',
      Success: false,
    })
  })

  it('rejects malformed request JSON', async () => {
    const res = await invoke({ body: '{' })

    expect(res.statusCode).toBe(400)
    expect(parseJsonBody(res)).toMatchObject({
      Error: 'Invalid JSON body.',
      Success: false,
    })
  })

  it('rejects malformed nested JSON payloads', async () => {
    const res = await invoke({ body: JSON.stringify({ json: '{' }) })

    expect(res.statusCode).toBe(400)
    expect(parseJsonBody(res)).toMatchObject({
      Error: 'Invalid "json" payload.',
      Success: false,
    })
  })

  it('rejects requests without a target URL', async () => {
    const res = await invoke({ body: '' })

    expect(res.statusCode).toBe(400)
    expect(parseJsonBody(res)).toMatchObject({
      Error: 'Missing target URL.',
      Success: false,
    })
  })

  it('rejects malformed forwarded headers', async () => {
    const res = await invoke({
      body: JSON.stringify({
        headers: 'X-Valid: yes\nbroken',
        url: 'https://api.example.test',
      }),
    })

    expect(res.statusCode).toBe(400)
    expect(parseJsonBody(res)).toMatchObject({
      Error: 'Invalid Header:\nbroken',
      Success: false,
    })
  })

  it('forwards valid proxy requests and returns sender-shaped responses', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('accepted', {
      headers: {
        'content-type': 'text/plain',
        'x-reply': 'ok',
      },
      status: 202,
      statusText: 'Accepted',
    }))
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(Date, 'now').mockReturnValueOnce(1000).mockReturnValueOnce(1025)

    const res = await invoke({
      body: [
        Buffer.from(JSON.stringify({
          json: {
            body: 'hello',
            contentType: 'text/custom',
            headers: '\nHost: ignored\nContent-Length: 99\nX-Test: yes',
            idnUrl: 'https://api.example.test/resource',
            method: 'patch',
          },
        })),
      ],
    })

    expect(fetchMock).toHaveBeenCalledWith('https://api.example.test/resource', {
      body: 'hello',
      headers: {
        'Content-Type': 'text/custom',
        'X-Test': 'yes',
      },
      method: 'PATCH',
    })
    expect(res.statusCode).toBe(200)
    expect(parseJsonBody(res)).toMatchObject({
      Content: 'accepted',
      ContentLength: 8,
      ContentType: 'text/plain',
      Elapsed: 25,
      StatusCode: 202,
      StatusDescription: 'Accepted',
      Success: true,
      Version: '1.1',
    })
    expect(String(parseJsonBody(res).Headers)).toContain('x-reply: ok\n')
  })

  it('uses default GET method and direct url payloads', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, {
      status: 404,
      statusText: 'Not Found',
    }))
    vi.stubGlobal('fetch', fetchMock)

    const res = await invoke({
      body: JSON.stringify({
        json: JSON.stringify({
          url: 'https://api.example.test/missing',
        }),
      }),
    })

    expect(fetchMock).toHaveBeenCalledWith('https://api.example.test/missing', {
      headers: {},
      method: 'GET',
    })
    expect(parseJsonBody(res)).toMatchObject({
      Content: '',
      ContentLength: 0,
      ContentType: '',
      StatusCode: 404,
      Success: false,
    })
  })

  it('stringifies non-string request bodies before forwarding', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('ok'))
    vi.stubGlobal('fetch', fetchMock)

    await invoke({
      body: JSON.stringify({
        body: 42,
        method: 'POST',
        url: 'https://api.example.test',
      }),
    })

    expect(fetchMock).toHaveBeenCalledWith('https://api.example.test', {
      body: '42',
      headers: {},
      method: 'POST',
    })
  })

  it('returns a proxy error when the target request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network failed')))

    const res = await invoke({
      body: JSON.stringify({
        url: 'https://api.example.test',
      }),
    })

    expect(res.statusCode).toBe(502)
    expect(parseJsonBody(res)).toMatchObject({
      Error: 'Error sending request.',
      Success: false,
    })
  })
})
