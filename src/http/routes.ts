import { useChain } from '@webquarx/design-patterns'
import type { FastifyInstance } from 'fastify'
import type { ConnectorInfo } from './connector-info.js'
import { healthResponseSchema, openApiResponseSchema, versionResponseSchema } from './schemas.js'

interface RouteRegistrationContext {
  app: FastifyInstance
  connectorInfo: ConnectorInfo
}

type RouteRegistrationStep = (
  execute: (context: RouteRegistrationContext) => Promise<void>,
  context: RouteRegistrationContext,
) => Promise<void>

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
    registerOpenApiRoute,
  ]).execute(context)
}
