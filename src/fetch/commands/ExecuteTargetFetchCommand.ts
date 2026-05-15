import { Command } from '@webquarx/design-patterns'
import type { ExecutableFetchRequest, TargetFetchFailure, TargetFetchResult } from '../types.js'

export const DEFAULT_TARGET_REQUEST_TIMEOUT_MS = 300_000
export const DEFAULT_REQUEST_BODY_LIMIT_BYTES = 5 * 1024 * 1024
export const DEFAULT_RESPONSE_BODY_LIMIT_BYTES = 5 * 1024 * 1024

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>

interface ExecuteTargetFetchCommandOptions {
  fetchImpl?: FetchLike
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

export class ExecuteTargetFetchCommand extends Command {
  private readonly fetchImpl: FetchLike
  private readonly now: () => number
  private readonly requestBodyLimitBytes: number
  private readonly responseBodyLimitBytes: number
  private readonly timeoutMs: number

  constructor({
    fetchImpl = fetch,
    now = Date.now,
    requestBodyLimitBytes = DEFAULT_REQUEST_BODY_LIMIT_BYTES,
    responseBodyLimitBytes = DEFAULT_RESPONSE_BODY_LIMIT_BYTES,
    timeoutMs = DEFAULT_TARGET_REQUEST_TIMEOUT_MS,
  }: ExecuteTargetFetchCommandOptions = {}) {
    super()
    this.fetchImpl = fetchImpl
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

    try {
      const response = await this.fetchImpl(request.url, {
        body: request.body,
        headers: request.headers,
        method: request.method,
        redirect: 'manual',
        signal: controller.signal,
      })
      const body = await readResponseBody(response, this.responseBodyLimitBytes)
      if (isFailure(body)) {
        clearTimeout(timeout)
        return body
      }

      const result: TargetFetchResult = {
        ok: true,
        response: {
          body,
          contentType: response.headers.get('content-type') || '',
          elapsedMs: this.now() - startedAt,
          headers: collectHeaders(response),
          status: response.status,
          statusText: response.statusText,
        },
      }
      clearTimeout(timeout)
      return result
    } catch {
      clearTimeout(timeout)
      if (controller.signal.aborted) {
        return failure('timeout', 'Target request timed out.')
      }

      return failure('network-error', 'Target request failed.')
    }
  }
}
