import { versionResponseSchema } from './version.schema.js'
import { correlationIdHeaderSchema } from './common.schema.js'
import type { RouteRegistrationStep } from './types.js'

export const registerVersionRoute: RouteRegistrationStep = async (execute, context) => {
  context.app.get('/version', {
    schema: {
      headers: correlationIdHeaderSchema,
      response: {
        200: versionResponseSchema,
      },
    },
  }, async () => context.connectorInfo)

  await execute(context)
}
