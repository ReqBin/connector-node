import { healthResponseSchema } from './health.schema.js'
import type { RouteRegistrationStep } from './types.js'

export const registerHealthRoute: RouteRegistrationStep = async (execute, context) => {
  context.app.get('/health', {
    schema: {
      response: {
        200: healthResponseSchema,
      },
    },
  }, async () => ({ status: 'up' }))

  await execute(context)
}
