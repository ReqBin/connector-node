import { Command } from '@webquarx/design-patterns'
import type {
  ExecutableFetchRequest,
  TargetFetchFailure,
  TargetFetchRedirect,
  TargetFetchResult,
} from '../types.js'
import { validateTargetUrlPolicy } from '../../security/target-policy.js'

export const DEFAULT_TARGET_REQUEST_TIMEOUT_MS = 300_000
export const DEFAULT_REQUEST_BODY_LIMIT_BYTES = 5 * 1024 * 1024
export const DEFAULT_RESPONSE_BODY_LIMIT_BYTES = 5 * 1024 * 1024
export const DEFAULT_MAX_REDIRECTS = 10

export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>

interface ExecuteTargetFetchCommandOptions {
  fetchImpl?: FetchLike
  maxRedirects?: number
  now?: () => number
  requestBodyLimitBytes?: number
  responseBodyLimitBytes?: number
  timeoutMs?: number
}

function failure(code: TargetFetchFailure['code'], message: string): TargetFetchFailure {
  return {
    code,
    message,
    ok: false,
  }
}

function isFailure(value: Uint8Array | TargetFetchFailure): value is TargetFetchFailure {
  return 'ok' in value && value.ok === false
}

function getBodyByteLength(body: string | undefined): number {
  return body === undefined ? 0 : Buffer.byteLength(body, 'utf8')
}

async function readResponseBody(response: Response, limitBytes: number): Promise<Uint8Array | TargetFetchFailure> {
  if (response.body === null) {
    return new Uint8Array()
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let totalBytes = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }

    totalBytes += value.byteLength
    if (totalBytes > limitBytes) {
      await reader.cancel()
      return failure('response-body-too-large', 'Target response body exceeds the configured limit.')
    }

    chunks.push(value)
  }

  const body = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }

  return body
}

function collectHeaders(response: Response): Record<string, string> {
  const headers: Record<string, string> = {}

  response.headers.forEach((value, name) => {
    headers[name] = value
  })

  return headers
}

function getRedirectLocation(response: Response): string | undefined {
  const location = response.headers.get('location')
  return location === null || location.trim().length === 0 ? undefined : location
}

function isRedirectStatus(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308
}

function shouldConvertRedirectToGet(status: number, method: string): boolean {
  return (status === 303 && method !== 'GET' && method !== 'HEAD')
    || ((status === 301 || status === 302) && method === 'POST')
}

function stripBodyHeaders(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(headers).filter(([name]) => name.toLowerCase() !== 'content-type'))
}

export class ExecuteTargetFetchCommand extends Command {
  private readonly fetchImpl: FetchLike
  private readonly maxRedirects: number
  private readonly now: () => number
  private readonly requestBodyLimitBytes: number
  private readonly responseBodyLimitBytes: number
  private readonly timeoutMs: number

  constructor({
    fetchImpl = fetch,
    maxRedirects = DEFAULT_MAX_REDIRECTS,
    now = Date.now,
    requestBodyLimitBytes = DEFAULT_REQUEST_BODY_LIMIT_BYTES,
    responseBodyLimitBytes = DEFAULT_RESPONSE_BODY_LIMIT_BYTES,
    timeoutMs = DEFAULT_TARGET_REQUEST_TIMEOUT_MS,
  }: ExecuteTargetFetchCommandOptions = {}) {
    super()
    this.fetchImpl = fetchImpl
    this.maxRedirects = maxRedirects
    this.now = now
    this.requestBodyLimitBytes = requestBodyLimitBytes
    this.responseBodyLimitBytes = responseBodyLimitBytes
    this.timeoutMs = timeoutMs
  }

  async execute(request: ExecutableFetchRequest): Promise<TargetFetchResult> {
    if (getBodyByteLength(request.body) > this.requestBodyLimitBytes) {
      return failure('request-body-too-large', 'Target request body exceeds the configured limit.')
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs)
    const startedAt = this.now()
    const redirects: TargetFetchRedirect[] = []
    let body = request.body
    let headers = request.headers
    let method = request.method
    let url = request.url
    let hopStartedAt = startedAt

    try {
      while (true) {
        const response = await this.fetchImpl(url, {
          body,
          headers,
          method,
          redirect: 'manual',
          signal: controller.signal,
        })
        const responseReceivedAt = this.now()

        const redirectLocation = getRedirectLocation(response)
        if (isRedirectStatus(response.status) && redirectLocation !== undefined) {
          if (redirects.length >= this.maxRedirects) {
            clearTimeout(timeout)
            return failure('too-many-redirects', 'Target redirect chain exceeds the configured limit.')
          }

          const nextUrl = new URL(redirectLocation, url)
          const targetPolicy = validateTargetUrlPolicy(nextUrl)
          if (!targetPolicy.ok) {
            clearTimeout(timeout)
            return failure('blocked-redirect', 'Redirect target host is blocked by connector policy.')
          }

          redirects.push({
            elapsedMs: responseReceivedAt - hopStartedAt,
            headers: collectHeaders(response),
            status: response.status,
            url: nextUrl.href,
          })

          if (shouldConvertRedirectToGet(response.status, method)) {
            body = undefined
            headers = stripBodyHeaders(headers)
            method = 'GET'
          }

          url = nextUrl
          hopStartedAt = this.now()
          continue
        }

        const responseBody = await readResponseBody(response, this.responseBodyLimitBytes)
        if (isFailure(responseBody)) {
          clearTimeout(timeout)
          return responseBody
        }

        const redirectsTimeMs = redirects.reduce((sum, redirect) => sum + redirect.elapsedMs, 0)
        const result: TargetFetchResult = {
          ok: true,
          response: {
            body: responseBody,
            contentType: response.headers.get('content-type') || '',
            elapsedMs: this.now() - startedAt,
            headers: collectHeaders(response),
            redirects,
            redirectsTimeMs,
            status: response.status,
            statusText: response.statusText,
          },
        }
        clearTimeout(timeout)
        return result
      }
    } catch {
      clearTimeout(timeout)
      if (controller.signal.aborted) {
        return failure('timeout', 'Target request timed out.')
      }

      return failure('network-error', 'Target request failed.')
    }
  }
}
