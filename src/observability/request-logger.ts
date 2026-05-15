import type { FastifyInstance, FastifyRequest } from 'fastify'

export interface RequestLogEntry {
  correlationId: string
  elapsedMs?: number
  event: 'reqbin.connector.request.finished' | 'reqbin.connector.request.started'
  method: string
  statusCode?: number
  url: string
}

export type ConnectorRequestLogger = (entry: RequestLogEntry) => void

declare module 'fastify' {
  interface FastifyRequest {
    requestStartedAt: number
  }
}

function createRequestLogEntry(
  request: FastifyRequest,
  event: RequestLogEntry['event'],
  details: Pick<RequestLogEntry, 'elapsedMs' | 'statusCode'> = {},
): RequestLogEntry {
  return {
    correlationId: request.id,
    event,
    method: request.method,
    url: request.url,
    ...details,
  }
}

export function writeRequestLog(entry: RequestLogEntry): void {
  console.log(JSON.stringify(entry))
}

export function registerRequestLoggingHooks(
  app: FastifyInstance,
  logger: ConnectorRequestLogger = writeRequestLog,
): void {
  app.addHook('onRequest', async (request) => {
    request.requestStartedAt = Date.now()
    logger(createRequestLogEntry(request, 'reqbin.connector.request.started'))
  })

  app.addHook('onResponse', async (request, reply) => {
    logger(createRequestLogEntry(request, 'reqbin.connector.request.finished', {
      elapsedMs: Date.now() - request.requestStartedAt,
      statusCode: reply.statusCode,
    }))
  })
}
