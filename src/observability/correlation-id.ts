import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'

export const CORRELATION_ID_HEADER = 'correlation-id'

export function createCorrelationId(): string {
  return randomUUID()
}

export function registerCorrelationIdHook(app: FastifyInstance): void {
  app.addHook('onRequest', async (request, reply) => {
    reply.header(CORRELATION_ID_HEADER, request.id)
  })
}
