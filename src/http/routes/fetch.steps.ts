import type { FastifyReply, FastifyRequest } from 'fastify'
import type { RouteRegistrationContext } from './types.js'
import { ExecuteTargetFetchCommand } from '../../fetch/commands/ExecuteTargetFetchCommand.js'
import { MapTargetFetchResultCommand } from '../../fetch/commands/MapTargetFetchResultCommand.js'
import { ParseFetchPayloadCommand } from '../../fetch/commands/ParseFetchPayloadCommand.js'
import type { ConnectorSenderResponse, FetchPayloadSuccess } from '../../fetch/types.js'
import { sanitizeForwardedHeaders, type HeaderPolicySuccess } from '../../security/header-policy.js'
import { validateTargetUrlPolicy } from '../../security/target-policy.js'
import { authorizeBearerToken } from '../../security/token-auth.js'

export interface FetchRouteChainContext {
  headers?: HeaderPolicySuccess
  parsed?: FetchPayloadSuccess
  reply: FastifyReply
  request: FastifyRequest
  response?: ConnectorSenderResponse
  route: RouteRegistrationContext
}

type FetchRouteExecute = (context: FetchRouteChainContext) => Promise<unknown>

export async function authorizeFetchRouteStep(
  execute: FetchRouteExecute,
  context: FetchRouteChainContext,
): Promise<unknown> {
  const auth = authorizeBearerToken(context.request.headers.authorization, context.route.pairingStore, context.route.auth)

  if (!auth.ok) {
    return context.reply
      .code(401)
      .send({
        error: auth.reason,
        message: 'Authentication failed.',
      })
  }

  return execute(context)
}

export async function parseFetchPayloadStep(
  execute: FetchRouteExecute,
  context: FetchRouteChainContext,
): Promise<unknown> {
  const parsed = await new ParseFetchPayloadCommand().execute(context.request.body)
  if (!parsed.ok) {
    return context.reply
      .code(400)
      .send({
        error: parsed.code,
        message: parsed.message,
      })
  }

  context.parsed = parsed
  return execute(context)
}

export async function validateFetchTargetStep(
  execute: FetchRouteExecute,
  context: FetchRouteChainContext,
): Promise<unknown> {
  const targetPolicy = validateTargetUrlPolicy(context.parsed!.request.url)
  if (!targetPolicy.ok) {
    return context.reply
      .code(400)
      .send({
        error: targetPolicy.reason,
        message: 'Target host is blocked by connector policy.',
      })
  }

  return execute(context)
}

export async function sanitizeFetchHeadersStep(
  execute: FetchRouteExecute,
  context: FetchRouteChainContext,
): Promise<unknown> {
  const headerPolicy = sanitizeForwardedHeaders(context.parsed!.request.headersText)
  if (!headerPolicy.ok) {
    return context.reply
      .code(400)
      .send({
        error: headerPolicy.reason,
        message: 'Forwarded header block contains an invalid header.',
      })
  }

  context.headers = headerPolicy
  return execute(context)
}

export async function executeFetchTargetStep(
  execute: FetchRouteExecute,
  context: FetchRouteChainContext,
): Promise<unknown> {
  const targetResult = await new ExecuteTargetFetchCommand({
    fetchImpl: context.route.targetFetch,
  }).execute({
    ...context.parsed!.request,
    headers: context.headers!.headers,
  })

  context.response = await new MapTargetFetchResultCommand().execute(targetResult)
  return execute(context)
}

export async function sendFetchResponseStep(
  _execute: FetchRouteExecute,
  context: FetchRouteChainContext,
): Promise<unknown> {
  return context.reply
    .code(200)
    .send(context.response)
}
