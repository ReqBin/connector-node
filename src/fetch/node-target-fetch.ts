import http from 'node:http'
import https from 'node:https'
import { performance } from 'node:perf_hooks'
import { Readable } from 'node:stream'
import type { TargetFetchTimings } from './types.js'

const responseTimings = new WeakMap<Response, Partial<TargetFetchTimings>>()
const responseRawHeaders = new WeakMap<Response, string>()

function getHeaders(initHeaders: HeadersInit | undefined): Record<string, string> {
  const headers: Record<string, string> = {}
  new Headers(initHeaders).forEach((value, name) => {
    headers[name] = value
  })

  return headers
}

function getBodyBuffer(body: BodyInit | null | undefined): Buffer | undefined {
  if (body === null || body === undefined) {
    return undefined
  }

  if (typeof body === 'string') {
    return Buffer.from(body)
  }

  if (body instanceof Uint8Array) {
    return Buffer.from(body)
  }

  throw new Error('Unsupported target request body type.')
}

function createPhaseTimings(
  startedAt: number,
  socketAssignedAt: number | undefined,
  lookupEndedAt: number | undefined,
  connectedAt: number | undefined,
  secureConnectedAt: number | undefined,
  requestFinishedAt: number | undefined,
  responseReceivedAt: number,
): Partial<TargetFetchTimings> {
  const connectedOrStartedAt = secureConnectedAt ?? connectedAt ?? startedAt
  const connectStartedAt = lookupEndedAt ?? socketAssignedAt

  return {
    connectingMs: connectedAt === undefined || connectStartedAt === undefined ? 0 : connectedAt - connectStartedAt,
    dnsMs: lookupEndedAt === undefined || socketAssignedAt === undefined ? 0 : lookupEndedAt - socketAssignedAt,
    sendingMs: requestFinishedAt === undefined ? 0 : Math.max(0, requestFinishedAt - connectedOrStartedAt),
    tlsMs: secureConnectedAt === undefined || connectedAt === undefined ? 0 : secureConnectedAt - connectedAt,
    waitingMs: requestFinishedAt === undefined ? responseReceivedAt - startedAt : responseReceivedAt - requestFinishedAt,
  }
}

export function getNodeResponseTimings(response: Response): Partial<TargetFetchTimings> | undefined {
  return responseTimings.get(response)
}

export function getNodeResponseRawHeaders(response: Response): string | undefined {
  return responseRawHeaders.get(response)
}

function mapRawHeaders(rawHeaders: string[]): string {
  let headersText = ''
  for (let index = 0; index < rawHeaders.length; index += 2) {
    const name = rawHeaders[index]
    const value = rawHeaders[index + 1]
    if (name !== undefined && value !== undefined) {
      headersText += `${name}: ${value}\r\n`
    }
  }

  return headersText
}

export async function nodeTargetFetch(input: string | URL, init: RequestInit = {}): Promise<Response> {
  const url = input instanceof URL ? input : new URL(input)
  const transport = url.protocol === 'https:' ? https : http
  const body = getBodyBuffer(init.body)
  const startedAt = performance.now()

  return new Promise<Response>((resolve, reject) => {
    let socketAssignedAt: number | undefined
    let lookupEndedAt: number | undefined
    let connectedAt: number | undefined
    let secureConnectedAt: number | undefined
    let requestFinishedAt: number | undefined

    const request = transport.request(url, {
      headers: getHeaders(init.headers),
      method: init.method,
    }, (incomingMessage) => {
      const responseReceivedAt = performance.now()
      const headers = new Headers()
      for (const [name, value] of Object.entries(incomingMessage.headers)) {
        if (Array.isArray(value)) {
          headers.set(name, value.join(', '))
        } else if (value !== undefined) {
          headers.set(name, value)
        }
      }

      const responseBody = incomingMessage.statusCode === 204 || incomingMessage.statusCode === 304
        ? null
        : Readable.toWeb(incomingMessage) as ReadableStream<Uint8Array>
      const response = new Response(responseBody, {
        headers,
        status: incomingMessage.statusCode,
        statusText: incomingMessage.statusMessage,
      })
      responseTimings.set(response, createPhaseTimings(
        startedAt,
        socketAssignedAt,
        lookupEndedAt,
        connectedAt,
        secureConnectedAt,
        requestFinishedAt,
        responseReceivedAt,
      ))
      responseRawHeaders.set(response, mapRawHeaders(incomingMessage.rawHeaders))
      resolve(response)
    })

    request.once('socket', (socket) => {
      socketAssignedAt = performance.now()
      socket.once('lookup', () => {
        lookupEndedAt = performance.now()
      })
      socket.once('connect', () => {
        connectedAt = performance.now()
      })
      socket.once('secureConnect', () => {
        secureConnectedAt = performance.now()
      })
    })
    request.once('finish', () => {
      requestFinishedAt = performance.now()
    })
    request.once('error', reject)
    init.signal?.addEventListener('abort', () => {
      request.destroy(new Error('aborted'))
    }, { once: true })

    if (init.signal?.aborted) {
      request.destroy(new Error('aborted'))
      return
    }

    request.end(body)
  })
}
