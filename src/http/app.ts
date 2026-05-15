import swagger from '@fastify/swagger'
import Fastify, { type FastifyInstance } from 'fastify'
import { createDefaultConnectorInfo, type ConnectorInfo } from './connector-info.js'
import { registerCors, type CorsOptions } from './cors.js'
import { registerRoutes } from './routes.js'
import type { FetchLike } from '../fetch/commands/ExecuteTargetFetchCommand.js'
import { CORRELATION_ID_HEADER, createCorrelationId, registerCorrelationIdHook } from '../observability/correlation-id.js'
import { MemoryPairingStore, type PairingStore } from '../security/pairing.js'
import type { TokenAuthOptions } from '../security/token-auth.js'

export interface CreateAppOptions {
  auth?: TokenAuthOptions
  connectorInfo?: ConnectorInfo
  cors?: CorsOptions
  pairingStore?: PairingStore
  targetFetch?: FetchLike
}

export async function createApp({
  auth,
  connectorInfo = createDefaultConnectorInfo(),
  cors,
  pairingStore = new MemoryPairingStore(),
  targetFetch,
}: CreateAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    genReqId: createCorrelationId,
    logger: false,
    requestIdHeader: CORRELATION_ID_HEADER,
    requestIdLogLabel: 'correlationId',
  })

  await registerCors(app, cors)

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'ReqBin Connector API',
        version: connectorInfo.version,
      },
      openapi: '3.0.3',
    },
  })

  await registerRoutes({
    app,
    auth,
    connectorInfo,
    pairingStore,
    targetFetch,
  })
  registerCorrelationIdHook(app)

  return app
}
