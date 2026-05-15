import { useChain } from '@webquarx/design-patterns'
import {
  fetchAuthErrorResponseSchema,
  fetchSenderResponseSchema,
  fetchValidationErrorResponseSchema,
} from './fetch.schema.js'
import {
  authorizeFetchRouteStep,
  executeFetchTargetStep,
  parseFetchPayloadStep,
  sanitizeFetchHeadersStep,
  sendFetchResponseStep,
  validateFetchTargetStep,
} from './fetch.steps.js'
import type { RouteRegistrationStep } from './types.js'

export const registerFetchRoute: RouteRegistrationStep = async (execute, context) => {
  const fetchRouteChain = useChain([
    authorizeFetchRouteStep,
    parseFetchPayloadStep,
    validateFetchTargetStep,
    sanitizeFetchHeadersStep,
    executeFetchTargetStep,
    sendFetchResponseStep,
  ])

  context.app.post('/v1/fetch', {
    schema: {
      response: {
        200: fetchSenderResponseSchema,
        400: fetchValidationErrorResponseSchema,
        401: fetchAuthErrorResponseSchema,
      },
    },
  }, async (request, reply) => {
    return fetchRouteChain.execute({
      reply,
      request,
      route: context,
    })
  })

  await execute(context)
}
