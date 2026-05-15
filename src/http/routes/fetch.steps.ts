import type { FastifyReply, FastifyRequest } from 'fastify'
import type { RouteRegistrationContext } from './types.js'
import { ExecuteTargetFetchCommand } from '../../fetch/commands/ExecuteTargetFetchCommand.js'
import { MapTargetFetchResultCommand } from '../../fetch/commands/MapTargetFetchResultCommand.js'
import { ParseFetchPayloadCommand } from '../../fetch/commands/ParseFetchPayloadCommand.js'
import type { ConnectorSenderResponse, FetchPayloadSuccess } from '../../fetch/types.js'
import {
  logFetchValidationFailed,
  logStrippedForwardedHeaders,
  logTargetFailed,
  logTargetFinished,
  logTargetStarted,
  writeRequestLog,
} from '../../observability/request-logger.js'
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

function getParsedPayload(context: FetchRouteChainContext): FetchPayloadSuccess {
  if (context.parsed === undefined) {
    throw new Error('Fetch route payload must be parsed before this step.')
  }

  return context.parsed
}

function getSanitizedHeaders(context: FetchRouteChainContext): HeaderPolicySuccess {
  if (context.headers === undefined) {
    throw new Error('Fetch route headers must be sanitized before this step.')
  }

  return context.headers
}

export async function authorizeFetchRouteStep(
  execute: FetchRouteExecute,
  context: FetchRouteChainContext,
): Promise<unknown> {
  const auth = authorizeBearerToken(context.request.headers.authorization, context.route.pairingStore, context.route.auth)

  if (!auth.ok) {
    logFetchValidationFailed(context.route.logger ?? writeRequestLog, context.request.id, 'auth', auth.reason)
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
    logFetchValidationFailed(context.route.logger ?? writeRequestLog, context.request.id, 'payload', parsed.code)
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
  const targetPolicy = validateTargetUrlPolicy(getParsedPayload(context).request.url)
  if (!targetPolicy.ok) {
    logFetchValidationFailed(context.route.logger ?? writeRequestLog, context.request.id, 'target-policy', targetPolicy.reason)
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
  const headerPolicy = sanitizeForwardedHeaders(getParsedPayload(context).request.headersText)
  if (!headerPolicy.ok) {
    logFetchValidationFailed(context.route.logger ?? writeRequestLog, context.request.id, 'headers', headerPolicy.reason)
    return context.reply
      .code(400)
      .send({
        error: headerPolicy.reason,
        message: 'Forwarded header block contains an invalid header.',
      })
  }

  context.headers = headerPolicy
  if (headerPolicy.strippedHeaders.length > 0) {
    logStrippedForwardedHeaders(
      context.route.logger ?? writeRequestLog,
      context.request.id,
      headerPolicy.strippedHeaders,
    )
  }

  return execute(context)
}

export async function executeFetchTargetStep(
  execute: FetchRouteExecute,
  context: FetchRouteChainContext,
): Promise<unknown> {
  const parsed = getParsedPayload(context)
  const sanitizedHeaders = getSanitizedHeaders(context)
  const logger = context.route.logger ?? writeRequestLog
  const startedAt = Date.now()
  logTargetStarted(logger, context.request.id, parsed.request.method, parsed.request.url)

  const targetResult = await new ExecuteTargetFetchCommand({
    fetchImpl: context.route.targetFetch,
    ...context.route.targetFetchOptions,
  }).execute({
    ...parsed.request,
    headers: sanitizedHeaders.headers,
  })
  if (targetResult.ok) {
    logTargetFinished(
      logger,
      context.request.id,
      parsed.request.method,
      parsed.request.url,
      targetResult.response.status,
      Date.now() - startedAt,
    )
  } else {
    logTargetFailed(logger, context.request.id, parsed.request.method, parsed.request.url, Date.now() - startedAt)
  }

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
