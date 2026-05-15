import { Command } from '@webquarx/design-patterns'
import type {
  ExecutableFetchRequest,
  TargetFetchRedirect,
  TargetFetchResult,
} from '../types.js'
import type { TargetFetchOptions } from '../target-fetch-options.js'
import { getRedirectLocation, isRedirectStatus, shouldConvertRedirectToGet, stripBodyHeaders } from '../redirect-policy.js'
import { collectHeaders, readResponseBody } from '../target-response.js'
import { createTargetFetchFailure, isTargetFetchFailure } from '../target-fetch-failure.js'
import { createTargetTimings } from '../target-timings.js'
import { getNodeResponseRawHeaders, getNodeResponseTimings, nodeTargetFetch } from '../node-target-fetch.js'
import {
  DEFAULT_MAX_REDIRECTS,
  DEFAULT_REQUEST_BODY_LIMIT_BYTES,
  DEFAULT_RESPONSE_BODY_LIMIT_BYTES,
  DEFAULT_TARGET_REQUEST_TIMEOUT_MS,
} from '../../config/limits.js'
import { validateTargetUrlPolicy } from '../../security/target-policy.js'

export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>

interface ExecuteTargetFetchCommandOptions extends TargetFetchOptions {
  fetchImpl?: FetchLike
  now?: () => number
}

function getBodyByteLength(body: string | undefined): number {
  return body === undefined ? 0 : Buffer.byteLength(body, 'utf8')
}

function resolveRedirectRequestUrlText(location: string, nextUrl: URL): string {
  try {
    return new URL(location).href === nextUrl.href ? location : nextUrl.href
  } catch {
    return nextUrl.href
  }
}

export class ExecuteTargetFetchCommand extends Command {
  private readonly fetchImpl: FetchLike
  private readonly maxRedirects: number
  private readonly now: () => number
  private readonly requestBodyLimitBytes: number
  private readonly responseBodyLimitBytes: number
  private readonly timeoutMs: number

  constructor({
    fetchImpl = nodeTargetFetch,
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
    let urlText = request.url.href
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
        const phases = getNodeResponseTimings(response)

        const redirectLocation = getRedirectLocation(response)
        if (isRedirectStatus(response.status) && redirectLocation !== undefined) {
          if (redirects.length >= this.maxRedirects) {
            clearTimeout(timeout)
            return createTargetFetchFailure('too-many-redirects', 'Target redirect chain exceeds the configured limit.')
          }

          const nextUrl = new URL(redirectLocation, url)
          const nextUrlText = resolveRedirectRequestUrlText(redirectLocation, nextUrl)
          const targetPolicy = validateTargetUrlPolicy(nextUrl)
          if (!targetPolicy.ok) {
            clearTimeout(timeout)
            return createTargetFetchFailure('blocked-redirect', 'Redirect target host is blocked by connector policy.')
          }

          redirects.push({
            elapsedMs: responseReceivedAt - hopStartedAt,
            headers: collectHeaders(response),
            headersText: getNodeResponseRawHeaders(response),
            method,
            status: response.status,
            timings: createTargetTimings({
              phases,
              responseReceivedAt,
              startedAt: hopStartedAt,
            }),
            url: urlText,
          })

          if (shouldConvertRedirectToGet(response.status, method)) {
            body = undefined
            headers = stripBodyHeaders(headers)
            method = 'GET'
          }

          url = nextUrl
          urlText = nextUrlText
          hopStartedAt = this.now()
          continue
        }

        const responseBody = await readResponseBody(response, this.responseBodyLimitBytes)
        const bodyEndedAt = this.now()
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
            elapsedMs: bodyEndedAt - hopStartedAt,
            headers: collectHeaders(response),
            headersText: getNodeResponseRawHeaders(response),
            redirects,
            redirectsTimeMs,
            status: response.status,
            statusText: response.statusText,
            timings: createTargetTimings({
              bodyEndedAt,
              phases,
              responseReceivedAt,
              startedAt: hopStartedAt,
            }),
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
