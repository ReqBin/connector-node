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
  | 'request-body-too-large'
  | 'response-body-too-large'
  | 'timeout'

export interface TargetFetchResponse {
  body: Uint8Array
  contentType: string
  elapsedMs: number
  headers: Record<string, string>
  status: number
  statusText: string
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
