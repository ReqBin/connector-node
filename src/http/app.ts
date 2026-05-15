import swagger from '@fastify/swagger'
import Fastify, { type FastifyInstance } from 'fastify'
import { createDefaultConnectorInfo, type ConnectorInfo } from './connector-info.js'
import { registerCors, type CorsOptions } from './cors.js'
import { registerRoutes } from './routes.js'
import { CORRELATION_ID_HEADER, createCorrelationId, registerCorrelationIdHook } from '../observability/correlation-id.js'
import { MemoryPairingStore, type PairingStore } from '../security/pairing.js'

export interface CreateAppOptions {
  connectorInfo?: ConnectorInfo
  cors?: CorsOptions
  pairingStore?: PairingStore
}

export async function createApp({
  connectorInfo = createDefaultConnectorInfo(),
  cors,
  pairingStore = new MemoryPairingStore(),
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
    connectorInfo,
    pairingStore,
  })
  registerCorrelationIdHook(app)

  return app
}
