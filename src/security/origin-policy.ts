export const DEFAULT_ALLOWED_ORIGINS = [
  'https://beta.reqbin.com',
  'https://reqbin.com',
] as const

export const DEV_ALLOWED_ORIGINS = [
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
  'http://localhost:3000',
  'http://localhost:5173',
] as const

export interface OriginPolicyOptions {
  allowDevOrigins?: boolean
  allowedOrigins?: readonly string[]
}

export function resolveAllowedOrigins({
  allowDevOrigins = false,
  allowedOrigins = [],
}: OriginPolicyOptions = {}): ReadonlySet<string> {
  return new Set([
    ...DEFAULT_ALLOWED_ORIGINS,
    ...(allowDevOrigins ? DEV_ALLOWED_ORIGINS : []),
    ...allowedOrigins,
  ])
}

export function isOriginAllowed(origin: string | undefined, options: OriginPolicyOptions = {}): boolean {
  if (origin === undefined) {
    return false
  }

  return resolveAllowedOrigins(options).has(origin)
}
