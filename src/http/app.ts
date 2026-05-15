import swagger from '@fastify/swagger'
import Fastify, { type FastifyInstance } from 'fastify'
import { createDefaultConnectorInfo, type ConnectorInfo } from './connector-info.js'
import { registerCors, type CorsOptions } from './cors.js'
import { registerRoutes } from './routes.js'
import { DEFAULT_CONNECTOR_INBOUND_BODY_LIMIT_BYTES } from '../config/limits.js'
import type { FetchLike } from '../fetch/commands/ExecuteTargetFetchCommand.js'
import type { TargetFetchOptions } from '../fetch/target-fetch-options.js'
import { CORRELATION_ID_HEADER, createCorrelationId, registerCorrelationIdHook } from '../observability/correlation-id.js'
import { registerRequestLoggingHooks, type ConnectorLogger } from '../observability/request-logger.js'
import { MemoryPairingStore, type PairingStore } from '../security/pairing.js'
import type { TokenAuthOptions } from '../security/token-auth.js'

export interface CreateAppOptions {
  auth?: TokenAuthOptions
  connectorInfo?: ConnectorInfo
  cors?: CorsOptions
  pairingStore?: PairingStore
  requestLogger?: ConnectorLogger
  targetFetch?: FetchLike
  targetFetchOptions?: TargetFetchOptions
}

export async function createApp({
  auth,
  connectorInfo = createDefaultConnectorInfo(),
  cors,
  pairingStore = new MemoryPairingStore(),
  requestLogger,
  targetFetch,
  targetFetchOptions,
}: CreateAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    bodyLimit: DEFAULT_CONNECTOR_INBOUND_BODY_LIMIT_BYTES,
    genReqId: createCorrelationId,
    logger: false,
    requestIdHeader: CORRELATION_ID_HEADER,
    requestIdLogLabel: 'correlationId',
  })
  registerCorrelationIdHook(app)
  registerRequestLoggingHooks(app, requestLogger)

  await registerCors(app, cors)

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'ReqBin Connector API',
        version: connectorInfo.version,
      },
      components: {
        securitySchemes: {
          BearerAuth: {
            scheme: 'bearer',
            type: 'http',
          },
        },
      },
      openapi: '3.0.3',
    },
  })

  await registerRoutes({
    app,
    auth,
    connectorInfo,
    logger: requestLogger,
    pairingStore,
    targetFetch,
    targetFetchOptions,
  })

  return app
}
