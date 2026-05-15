import { Command } from '@webquarx/design-patterns'
import { STATUS_CODES } from 'node:http'
import type {
  ConnectorRedirect,
  ConnectorSenderResponse,
  TargetFetchRedirect,
  TargetFetchResult,
} from '../types.js'
import { emptyTargetTimings, mapTargetTimingsToConnector } from '../target-timings.js'

const HTTP_VERSION = '1.1'
const ERROR_CONTENT_TYPE = 'text/plain; charset=utf-8'

function mapHeaders(headers: Record<string, string>, headersText?: string): string {
  if (headersText !== undefined) {
    return headersText
  }

  return Object.entries(headers)
    .map(([name, value]) => `${name}: ${value}\r\n`)
    .join('')
}

function mapRedirect(redirect: TargetFetchRedirect): ConnectorRedirect {
  return {
    elapsed: redirect.elapsedMs,
    headers: mapHeaders(redirect.headers, redirect.headersText),
    redirect_url: redirect.url,
    status_code: String(redirect.status),
    timings: mapTargetTimingsToConnector(redirect.timings),
  }
}

function getRedirectUrl(redirects: ConnectorRedirect[]): string {
  return redirects[redirects.length - 1]?.redirect_url ?? ''
}

function getStatusDescription(status: number, statusText: string): string {
  return statusText || STATUS_CODES[status] || ''
}

function getMimeType(contentType: string): string {
  return contentType.split(';', 1).join('').trim().toLowerCase()
}

function isTextLikeContentType(contentType: string): boolean {
  const mimeType = getMimeType(contentType)

  return mimeType.startsWith('text/')
    || mimeType === 'application/json'
    || mimeType === 'application/javascript'
    || mimeType === 'application/ecmascript'
    || mimeType === 'application/xml'
    || mimeType === 'image/svg+xml'
    || mimeType.endsWith('+json')
    || mimeType.endsWith('+xml')
}

function decodeTextBody(body: Uint8Array, contentType: string): string {
  return isTextLikeContentType(contentType) ? new TextDecoder().decode(body) : ''
}

function createBaseResponse(overrides: Partial<ConnectorSenderResponse>): ConnectorSenderResponse {
  return {
    Content: '',
    ContentLength: 0,
    ContentRaw: '',
    ContentType: '',
    Elapsed: 0,
    Headers: '',
    RedirectUrl: '',
    Redirects: [],
    RedirectsCount: 0,
    RedirectsTime: 0,
    StatusCode: 0,
    StatusDescription: '',
    Success: false,
    Timings: mapTargetTimingsToConnector(emptyTargetTimings()),
    Version: HTTP_VERSION,
    ...overrides,
  }
}

export class MapTargetFetchResultCommand extends Command {
  async execute(result: TargetFetchResult): Promise<ConnectorSenderResponse> {
    if (!result.ok) {
      return createBaseResponse({
        Content: result.message,
        ContentLength: Buffer.byteLength(result.message, 'utf8'),
        ContentType: ERROR_CONTENT_TYPE,
        StatusDescription: 'Error',
      })
    }

    const { response } = result
    const redirects = (response.redirects ?? []).map(mapRedirect)

    return createBaseResponse({
      Content: decodeTextBody(response.body, response.contentType),
      ContentLength: response.body.byteLength,
      ContentRaw: Buffer.from(response.body).toString('base64'),
      ContentType: response.contentType,
      Elapsed: response.elapsedMs,
      Headers: mapHeaders(response.headers, response.headersText),
      RedirectUrl: getRedirectUrl(redirects),
      Redirects: redirects,
      RedirectsCount: redirects.length,
      RedirectsTime: response.redirectsTimeMs ?? 0,
      StatusCode: response.status,
      StatusDescription: getStatusDescription(response.status, response.statusText),
      Success: true,
      Timings: mapTargetTimingsToConnector(response.timings),
    })
  }
}
