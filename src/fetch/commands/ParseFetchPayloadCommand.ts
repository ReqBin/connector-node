import { Command } from '@webquarx/design-patterns'
import { allowedHttpMethods, type FetchPayloadFailure, type FetchPayloadResult, type HttpMethod } from '../types.js'

interface RawFetchEnvelope {
  json?: unknown
}

interface RawFetchRequest {
  content?: unknown
  contentType?: unknown
  headers?: unknown
  idnUrl?: unknown
  method?: unknown
  url?: unknown
}

const methodsWithRequestBody = new Set<HttpMethod>([
  'DELETE',
  'PATCH',
  'POST',
  'PUT',
])

function failure(code: FetchPayloadFailure['code'], message: string): FetchPayloadFailure {
  return {
    code,
    message,
    ok: false,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFailure(value: unknown): value is FetchPayloadFailure {
  return isRecord(value) && value.ok === false
}

function parseJsonEnvelope(envelope: unknown): RawFetchRequest | FetchPayloadFailure {
  if (!isRecord(envelope)) {
    return failure('invalid-envelope', 'Request body must be a JSON object.')
  }

  const rawJson = (envelope as RawFetchEnvelope).json
  if (typeof rawJson === 'string') {
    try {
      const parsed = JSON.parse(rawJson) as unknown
      if (isRecord(parsed)) {
        return parsed
      }

      return failure('invalid-envelope', 'Decoded json payload must be an object.')
    } catch {
      return failure('malformed-json', 'Request json payload is malformed.')
    }
  }

  if (isRecord(rawJson)) {
    return rawJson
  }

  return failure('invalid-envelope', 'Request body must include a json payload.')
}

function parseMethod(value: unknown): HttpMethod | FetchPayloadFailure {
  const method = String(value || 'GET').toUpperCase()

  if (allowedHttpMethods.includes(method as HttpMethod)) {
    return method as HttpMethod
  }

  return failure('invalid-method', `Unsupported HTTP method: ${method}.`)
}

function parseTargetUrl(rawRequest: RawFetchRequest): URL | FetchPayloadFailure {
  const target = String(rawRequest.idnUrl || rawRequest.url || '').trim()
  if (target.length === 0) {
    return failure('missing-url', 'Target URL is required.')
  }

  let url: URL
  try {
    url = new URL(target)
  } catch {
    return failure('invalid-url', 'Target URL is invalid.')
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return failure('unsupported-scheme', 'Target URL must use http or https.')
  }

  return url
}

function parseBody(rawRequest: RawFetchRequest, method: HttpMethod): string | undefined {
  const contentType = typeof rawRequest.contentType === 'string' ? rawRequest.contentType : undefined
  const content = rawRequest.content

  if (!methodsWithRequestBody.has(method) || contentType === 'NOBODY' || content == null || content === '') {
    return undefined
  }

  return typeof content === 'string' ? content : String(content)
}

export class ParseFetchPayloadCommand extends Command {
  async execute(envelope: unknown): Promise<FetchPayloadResult> {
    const rawRequest = parseJsonEnvelope(envelope)
    if (isFailure(rawRequest)) {
      return rawRequest
    }

    const method = parseMethod(rawRequest.method)
    if (typeof method !== 'string') {
      return method
    }

    const url = parseTargetUrl(rawRequest)
    if (isFailure(url)) {
      return url
    }

    const contentType = typeof rawRequest.contentType === 'string' ? rawRequest.contentType : undefined

    return {
      ok: true,
      request: {
        body: parseBody(rawRequest, method),
        contentType,
        headersText: typeof rawRequest.headers === 'string' ? rawRequest.headers : '',
        method,
        url,
      },
    }
  }
}
