import { useChain } from '@webquarx/design-patterns'
import { registerFetchRoute } from './routes/fetch.route.js'
import { registerHealthRoute } from './routes/health.route.js'
import { registerOpenApiRoute } from './routes/openapi.route.js'
import { registerPairRoute } from './routes/pair.route.js'
import type { RouteRegistrationContext } from './routes/types.js'
import { registerVersionRoute } from './routes/version.route.js'

export async function registerRoutes(context: RouteRegistrationContext): Promise<void> {
  await useChain([
    registerHealthRoute,
    registerVersionRoute,
    registerPairRoute,
    registerFetchRoute,
    registerOpenApiRoute,
  ]).execute(context)
}
