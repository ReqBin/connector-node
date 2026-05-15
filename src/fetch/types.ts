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
