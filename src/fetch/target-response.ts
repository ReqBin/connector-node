import { createTargetFetchFailure } from './target-fetch-failure.js'
import type { TargetFetchFailure } from './types.js'

export function collectHeaders(response: Response): Record<string, string> {
  const headers: Record<string, string> = {}

  response.headers.forEach((value, name) => {
    headers[name] = value
  })

  return headers
}

export async function readResponseBody(response: Response, limitBytes: number): Promise<Uint8Array | TargetFetchFailure> {
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
      return createTargetFetchFailure('response-body-too-large', 'Target response body exceeds the configured limit.')
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
