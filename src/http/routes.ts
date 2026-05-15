import { useChain } from '@webquarx/design-patterns'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { ConnectorInfo } from './connector-info.js'
import {
  healthResponseSchema,
  openApiResponseSchema,
  pairErrorResponseSchema,
  pairRequestSchema,
  pairSuccessResponseSchema,
  versionResponseSchema,
} from './schemas.js'
import type { PairingFailure, PairingStore } from '../security/pairing.js'

interface RouteRegistrationContext {
  app: FastifyInstance
  connectorInfo: ConnectorInfo
  pairingStore: PairingStore
}

type RouteRegistrationStep = (
  execute: (context: RouteRegistrationContext) => Promise<void>,
  context: RouteRegistrationContext,
) => Promise<void>

interface PairRequestBody {
  code: string
}

function getPairingFailureStatus(failure: PairingFailure): 401 | 429 {
  if (failure.reason === 'attempt-limit') {
    return 429
  }

  return 401
}

const registerHealthRoute: RouteRegistrationStep = async (execute, context) => {
  context.app.get('/health', {
    schema: {
      response: {
        200: healthResponseSchema,
      },
    },
  }, async () => ({ status: 'up' }))

  await execute(context)
}

const registerPairRoute: RouteRegistrationStep = async (execute, context) => {
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

const registerVersionRoute: RouteRegistrationStep = async (execute, context) => {
  context.app.get('/version', {
    schema: {
      response: {
        200: versionResponseSchema,
      },
    },
  }, async () => context.connectorInfo)

  await execute(context)
}

const registerOpenApiRoute: RouteRegistrationStep = async (execute, context) => {
  context.app.get('/openapi.json', {
    schema: {
      response: {
        200: openApiResponseSchema,
      },
    },
  }, async () => context.app.swagger())

  await execute(context)
}

export async function registerRoutes(context: RouteRegistrationContext): Promise<void> {
  await useChain([
    registerHealthRoute,
    registerVersionRoute,
    registerPairRoute,
    registerOpenApiRoute,
  ]).execute(context)
}
