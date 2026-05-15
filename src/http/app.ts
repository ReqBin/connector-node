import swagger from '@fastify/swagger'
import Fastify, { type FastifyInstance } from 'fastify'
import { createDefaultConnectorInfo, type ConnectorInfo } from './connector-info.js'
import { registerRoutes } from './routes.js'

export interface CreateAppOptions {
  connectorInfo?: ConnectorInfo
}

export async function createApp({ connectorInfo = createDefaultConnectorInfo() }: CreateAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false,
  })

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
  })

  return app
}
