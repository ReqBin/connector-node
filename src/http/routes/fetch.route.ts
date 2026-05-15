import {
  fetchAuthErrorResponseSchema,
  fetchNotImplementedResponseSchema,
  fetchValidationErrorResponseSchema,
} from './fetch.schema.js'
import type { RouteRegistrationStep } from './types.js'
import { ParseFetchPayloadCommand } from '../../fetch/commands/ParseFetchPayloadCommand.js'
import { authorizeBearerToken } from '../../security/token-auth.js'

export const registerFetchRoute: RouteRegistrationStep = async (execute, context) => {
  context.app.post('/v1/fetch', {
    schema: {
      response: {
        400: fetchValidationErrorResponseSchema,
        401: fetchAuthErrorResponseSchema,
        501: fetchNotImplementedResponseSchema,
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

    return reply
      .code(501)
      .send({
        error: 'not-implemented',
        message: 'Fetch execution is not implemented yet.',
      })
  })

  await execute(context)
}
