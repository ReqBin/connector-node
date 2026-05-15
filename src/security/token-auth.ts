import type { PairingStore } from './pairing.js'

export interface TokenAuthSuccess {
  mode: 'disabled' | 'token'
  ok: true
}

export interface TokenAuthFailure {
  ok: false
  reason: 'invalid-token' | 'missing-token'
}

export type TokenAuthResult = TokenAuthSuccess | TokenAuthFailure

export interface TokenAuthOptions {
  authDisabled?: boolean
}

const bearerPrefix = 'Bearer '

export function parseBearerToken(authorization: string | undefined): string | undefined {
  if (authorization === undefined) {
    return undefined
  }

  if (!authorization.startsWith(bearerPrefix)) {
    return undefined
  }

  const token = authorization.slice(bearerPrefix.length).trim()
  if (token.length === 0) {
    return undefined
  }

  return token
}

export function authorizeBearerToken(
  authorization: string | undefined,
  pairingStore: Pick<PairingStore, 'hasToken'>,
  { authDisabled = false }: TokenAuthOptions = {},
): TokenAuthResult {
  if (authDisabled) {
    return {
      mode: 'disabled',
      ok: true,
    }
  }

  const token = parseBearerToken(authorization)
  if (token === undefined) {
    return {
      ok: false,
      reason: 'missing-token',
    }
  }

  if (!pairingStore.hasToken(token)) {
    return {
      ok: false,
      reason: 'invalid-token',
    }
  }

  return {
    mode: 'token',
    ok: true,
  }
}
