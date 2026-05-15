import type { FastifyInstance } from 'fastify'
import type { ConnectorInfo } from '../connector-info.js'
import type { FetchLike } from '../../fetch/commands/ExecuteTargetFetchCommand.js'
import type { TargetFetchOptions } from '../../fetch/target-fetch-options.js'
import type { ConnectorLogger } from '../../observability/request-logger.js'
import type { PairingStore } from '../../security/pairing.js'
import type { TokenAuthOptions } from '../../security/token-auth.js'

export interface RouteRegistrationContext {
  app: FastifyInstance
  auth?: TokenAuthOptions
  connectorInfo: ConnectorInfo
  logger?: ConnectorLogger
  pairingStore: PairingStore
  targetFetch?: FetchLike
  targetFetchOptions?: TargetFetchOptions
}

export type RouteRegistrationStep = (
  execute: (context: RouteRegistrationContext) => Promise<void>,
  context: RouteRegistrationContext,
) => Promise<void>
