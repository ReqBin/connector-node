import type { FastifyInstance, FastifyRequest } from 'fastify'

interface BaseLogEntry {
  correlationId: string
  event: string
}

export interface RequestLogEntry extends BaseLogEntry {
  elapsedMs?: number
  event: 'reqbin.connector.request.finished' | 'reqbin.connector.request.started'
  method: string
  statusCode?: number
  url: string
}

export interface TargetLogEntry extends BaseLogEntry {
  elapsedMs?: number
  event: 'reqbin.connector.target.failed' | 'reqbin.connector.target.finished' | 'reqbin.connector.target.started'
  hasQuery: boolean
  method: string
  statusCode?: number
  target: string
}

export interface FetchFailureLogEntry extends BaseLogEntry {
  event: 'reqbin.connector.fetch.validation_failed'
  reason: string
  stage: 'auth' | 'headers' | 'payload' | 'target-policy'
}

export interface StrippedHeadersLogEntry extends BaseLogEntry {
  event: 'reqbin.connector.forwarded_headers.stripped'
  headers: string[]
  level: 'warning'
}

export type ConnectorLogEntry = FetchFailureLogEntry | RequestLogEntry | StrippedHeadersLogEntry | TargetLogEntry
export type ConnectorLogger = (entry: ConnectorLogEntry) => void

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

export function writeRequestLog(entry: ConnectorLogEntry): void {
  console.log(JSON.stringify(entry))
}

export function sanitizeTargetUrlForLog(url: URL): Pick<TargetLogEntry, 'hasQuery' | 'target'> {
  return {
    hasQuery: url.search.length > 0,
    target: `${url.origin}${url.pathname}`,
  }
}

export function logTargetStarted(logger: ConnectorLogger, correlationId: string, method: string, url: URL): void {
  logger({
    correlationId,
    event: 'reqbin.connector.target.started',
    method,
    ...sanitizeTargetUrlForLog(url),
  })
}

export function logTargetFinished(
  logger: ConnectorLogger,
  correlationId: string,
  method: string,
  url: URL,
  statusCode: number,
  elapsedMs: number,
): void {
  logger({
    correlationId,
    elapsedMs,
    event: 'reqbin.connector.target.finished',
    method,
    statusCode,
    ...sanitizeTargetUrlForLog(url),
  })
}

export function logTargetFailed(
  logger: ConnectorLogger,
  correlationId: string,
  method: string,
  url: URL,
  elapsedMs: number,
): void {
  logger({
    correlationId,
    elapsedMs,
    event: 'reqbin.connector.target.failed',
    method,
    ...sanitizeTargetUrlForLog(url),
  })
}

export function logFetchValidationFailed(
  logger: ConnectorLogger,
  correlationId: string,
  stage: FetchFailureLogEntry['stage'],
  reason: string,
): void {
  logger({
    correlationId,
    event: 'reqbin.connector.fetch.validation_failed',
    reason,
    stage,
  })
}

export function logStrippedForwardedHeaders(
  logger: ConnectorLogger,
  correlationId: string,
  strippedHeaders: string[],
): void {
  logger({
    correlationId,
    event: 'reqbin.connector.forwarded_headers.stripped',
    headers: strippedHeaders.map(header => header.toLowerCase()).sort(),
    level: 'warning',
  })
}

export function registerRequestLoggingHooks(
  app: FastifyInstance,
  logger: ConnectorLogger = writeRequestLog,
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
