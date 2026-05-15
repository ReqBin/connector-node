import { Command } from '@webquarx/design-patterns'
import type {
  ExecutableFetchRequest,
  TargetFetchRedirect,
  TargetFetchResult,
} from '../types.js'
import { getRedirectLocation, isRedirectStatus, shouldConvertRedirectToGet, stripBodyHeaders } from '../redirect-policy.js'
import { collectHeaders, readResponseBody } from '../target-response.js'
import { createTargetFetchFailure, isTargetFetchFailure } from '../target-fetch-failure.js'
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

function getBodyByteLength(body: string | undefined): number {
  return body === undefined ? 0 : Buffer.byteLength(body, 'utf8')
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
      return createTargetFetchFailure('request-body-too-large', 'Target request body exceeds the configured limit.')
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
            return createTargetFetchFailure('too-many-redirects', 'Target redirect chain exceeds the configured limit.')
          }

          const nextUrl = new URL(redirectLocation, url)
          const targetPolicy = validateTargetUrlPolicy(nextUrl)
          if (!targetPolicy.ok) {
            clearTimeout(timeout)
            return createTargetFetchFailure('blocked-redirect', 'Redirect target host is blocked by connector policy.')
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
        if (isTargetFetchFailure(responseBody)) {
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
        return createTargetFetchFailure('timeout', 'Target request timed out.')
      }

      return createTargetFetchFailure('network-error', 'Target request failed.')
    }
  }
}
