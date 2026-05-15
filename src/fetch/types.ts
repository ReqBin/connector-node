export const allowedHttpMethods = [
  'DELETE',
  'GET',
  'HEAD',
  'OPTIONS',
  'PATCH',
  'POST',
  'PUT',
] as const

export type HttpMethod = typeof allowedHttpMethods[number]

export interface ParsedFetchRequest {
  body?: string
  contentType?: string
  headersText: string
  method: HttpMethod
  url: URL
}

export interface ExecutableFetchRequest extends ParsedFetchRequest {
  headers: Record<string, string>
}

export type FetchPayloadErrorCode =
  | 'invalid-envelope'
  | 'invalid-method'
  | 'invalid-url'
  | 'malformed-json'
  | 'missing-url'
  | 'unsupported-scheme'

export interface FetchPayloadSuccess {
  ok: true
  request: ParsedFetchRequest
}

export interface FetchPayloadFailure {
  code: FetchPayloadErrorCode
  message: string
  ok: false
}

export type FetchPayloadResult = FetchPayloadSuccess | FetchPayloadFailure

export type TargetFetchErrorCode =
  | 'network-error'
  | 'blocked-redirect'
  | 'request-body-too-large'
  | 'response-body-too-large'
  | 'too-many-redirects'
  | 'timeout'

export interface TargetFetchRedirect {
  elapsedMs: number
  headers: Record<string, string>
  headersText?: string
  method: HttpMethod
  status: number
  timings: TargetFetchTimings
  url: string
}

export interface TargetFetchTimings {
  connectingMs: number
  dnsMs: number
  receivingMs: number
  sendingMs: number
  tlsMs: number
  totalMs: number
  waitingMs: number
}

export interface TargetFetchResponse {
  body: Uint8Array
  contentType: string
  elapsedMs: number
  headers: Record<string, string>
  headersText?: string
  redirects?: TargetFetchRedirect[]
  redirectsTimeMs?: number
  status: number
  statusText: string
  timings: TargetFetchTimings
}

export interface TargetFetchSuccess {
  ok: true
  response: TargetFetchResponse
}

export interface TargetFetchFailure {
  code: TargetFetchErrorCode
  message: string
  ok: false
}

export type TargetFetchResult = TargetFetchSuccess | TargetFetchFailure

export interface ConnectorRedirect {
  elapsed: number
  headers?: string
  method: string
  redirect_url: string
  status_code: string
  timings?: ConnectorTimings
}

export interface ConnectorTimings {
  Connecting: number
  DNS: number
  Receiving: number
  Sending: number
  TLS: number
  Total: number
  Waiting: number
}

export interface ConnectorSenderResponse {
  Content: string
  ContentLength: number
  ContentRaw: string
  ContentType: string
  Elapsed: number
  Headers: string
  RedirectUrl: string
  Redirects: ConnectorRedirect[]
  RedirectsCount: number
  RedirectsTime: number
  StatusCode: number
  StatusDescription: string
  Success: boolean
  Timings: ConnectorTimings
  Version: string
}
