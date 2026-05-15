import { openApiResponseSchema } from './openapi.schema.js'
import { correlationIdHeaderSchema } from './common.schema.js'
import type { RouteRegistrationStep } from './types.js'

export const registerOpenApiRoute: RouteRegistrationStep = async (execute, context) => {
  context.app.get('/openapi.json', {
    schema: {
      headers: correlationIdHeaderSchema,
      response: {
        200: openApiResponseSchema,
      },
    },
  }, async () => context.app.swagger())

  await execute(context)
}
