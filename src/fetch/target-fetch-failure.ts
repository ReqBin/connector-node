import type { TargetFetchFailure } from './types.js'

export function createTargetFetchFailure(code: TargetFetchFailure['code'], message: string): TargetFetchFailure {
  return {
    code,
    message,
    ok: false,
  }
}

export function isTargetFetchFailure<T>(value: T | TargetFetchFailure): value is TargetFetchFailure {
  return typeof value === 'object'
    && value !== null
    && 'ok' in value
    && value.ok === false
}
