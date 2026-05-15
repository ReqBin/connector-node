import { Command } from '@webquarx/design-patterns'
import { STATUS_CODES } from 'node:http'
import type { ConnectorSenderResponse, ConnectorTimings, TargetFetchResult } from '../types.js'

const HTTP_VERSION = '1.1'
const ERROR_CONTENT_TYPE = 'text/plain; charset=utf-8'

function emptyTimings(totalMs = 0): ConnectorTimings {
  return {
    Connecting: 0,
    DNS: 0,
    Receiving: 0,
    Sending: 0,
    TLS: 0,
    Total: totalMs / 1000,
    Waiting: 0,
  }
}

function mapHeaders(headers: Record<string, string>): string {
  return Object.entries(headers)
    .map(([name, value]) => `${name}: ${value}\r\n`)
    .join('')
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
    Timings: emptyTimings(),
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

    return createBaseResponse({
      Content: decodeTextBody(response.body, response.contentType),
      ContentLength: response.body.byteLength,
      ContentRaw: Buffer.from(response.body).toString('base64'),
      ContentType: response.contentType,
      Elapsed: response.elapsedMs,
      Headers: mapHeaders(response.headers),
      StatusCode: response.status,
      StatusDescription: getStatusDescription(response.status, response.statusText),
      Success: true,
      Timings: emptyTimings(response.elapsedMs),
    })
  }
}
