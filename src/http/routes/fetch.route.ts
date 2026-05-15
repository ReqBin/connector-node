import {
  fetchAuthErrorResponseSchema,
  fetchSenderResponseSchema,
  fetchValidationErrorResponseSchema,
} from './fetch.schema.js'
import type { RouteRegistrationStep } from './types.js'
import { ExecuteTargetFetchCommand } from '../../fetch/commands/ExecuteTargetFetchCommand.js'
import { MapTargetFetchResultCommand } from '../../fetch/commands/MapTargetFetchResultCommand.js'
import { ParseFetchPayloadCommand } from '../../fetch/commands/ParseFetchPayloadCommand.js'
import { sanitizeForwardedHeaders } from '../../security/header-policy.js'
import { validateTargetUrlPolicy } from '../../security/target-policy.js'
import { authorizeBearerToken } from '../../security/token-auth.js'

export const registerFetchRoute: RouteRegistrationStep = async (execute, context) => {
  context.app.post('/v1/fetch', {
    schema: {
      response: {
        200: fetchSenderResponseSchema,
        400: fetchValidationErrorResponseSchema,
        401: fetchAuthErrorResponseSchema,
      },
    },
  }, async (request, reply) => {
    const auth = authorizeBearerToken(request.headers.authorization, context.pairingStore, context.auth)

    if (!auth.ok) {
      return reply
        .code(401)
        .send({
          error: auth.reason,
          message: 'Authentication failed.',
        })
    }

    const parsed = await new ParseFetchPayloadCommand().execute(request.body)
    if (!parsed.ok) {
      return reply
        .code(400)
        .send({
          error: parsed.code,
          message: parsed.message,
        })
    }

    const targetPolicy = validateTargetUrlPolicy(parsed.request.url)
    if (!targetPolicy.ok) {
      return reply
        .code(400)
        .send({
          error: targetPolicy.reason,
          message: 'Target host is blocked by connector policy.',
        })
    }

    const headerPolicy = sanitizeForwardedHeaders(parsed.request.headersText)
    if (!headerPolicy.ok) {
      return reply
        .code(400)
        .send({
          error: headerPolicy.reason,
          message: 'Forwarded header block contains an invalid header.',
        })
    }

    const targetResult = await new ExecuteTargetFetchCommand({
      fetchImpl: context.targetFetch,
    }).execute({
      ...parsed.request,
      headers: headerPolicy.headers,
    })
    const response = await new MapTargetFetchResultCommand().execute(targetResult)

    return reply
      .code(200)
      .send(response)
  })

  await execute(context)
}
