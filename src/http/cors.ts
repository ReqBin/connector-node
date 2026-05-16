import fastifyCors from '@fastify/cors'
import type { FastifyInstance } from 'fastify'
import { CORRELATION_ID_HEADER } from '../observability/correlation-id.js'
import { isOriginAllowed, type OriginPolicyOptions } from '../security/origin-policy.js'

export type CorsOptions = OriginPolicyOptions

const allowedHeaders = [
  'authorization',
  'cache-control',
  'content-type',
  CORRELATION_ID_HEADER,
  'pragma',
]

export async function registerCors(app: FastifyInstance, options: CorsOptions = {}): Promise<void> {
  await app.register(fastifyCors, {
    allowedHeaders,
    exposedHeaders: [CORRELATION_ID_HEADER],
    methods: ['GET', 'POST', 'OPTIONS'],
    origin: (origin, callback) => {
      callback(null, isOriginAllowed(origin, options))
    },
  })
}
