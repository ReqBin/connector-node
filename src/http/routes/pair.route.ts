import type { FastifyRequest } from 'fastify'
import { pairErrorResponseSchema, pairRequestSchema, pairSuccessResponseSchema } from './pair.schema.js'
import type { RouteRegistrationStep } from './types.js'
import type { PairingFailure } from '../../security/pairing.js'

interface PairRequestBody {
  code: string
}

function getPairingFailureStatus(failure: PairingFailure): 401 | 429 {
  if (failure.reason === 'attempt-limit') {
    return 429
  }

  return 401
}

export const registerPairRoute: RouteRegistrationStep = async (execute, context) => {
  context.app.post('/v1/pair', {
    schema: {
      body: pairRequestSchema,
      response: {
        200: pairSuccessResponseSchema,
        401: pairErrorResponseSchema,
        429: pairErrorResponseSchema,
      },
    },
  }, async (request: FastifyRequest<{ Body: PairRequestBody }>, reply) => {
    const result = context.pairingStore.pair(request.body.code)

    if (!result.ok) {
      return reply
        .code(getPairingFailureStatus(result))
        .send({
          error: result.reason,
          message: 'Pairing failed.',
        })
    }

    return {
      token: result.token,
      tokenType: 'Bearer',
    }
  })

  await execute(context)
}
