import type { FastifyInstance } from 'fastify'
import { createApp, type CreateAppOptions } from './http/app.js'
import { MemoryPairingStore, type PairingStore } from './security/pairing.js'

export interface StartServerOptions extends CreateAppOptions {
  host?: string
  listen?: ServerListen
  port?: number
}

export interface ServerListenOptions {
  host: string
  port: number
}

export type ServerListen = (app: FastifyInstance, options: ServerListenOptions) => Promise<void>

export function resolveServerPort(port: number | undefined, envPort = process.env.PORT): number {
  return port ?? Number(envPort || 7070)
}

export async function listenFastifyApp(app: FastifyInstance, options: ServerListenOptions): Promise<void> {
  await app.listen(options)
}

function getListeningPort(app: FastifyInstance, fallbackPort: number): number {
  const address = app.server.address()
  return typeof address === 'object' && address !== null ? address.port : fallbackPort
}

export interface ServerStartupLog {
  authDisabled: boolean
  event: 'reqbin.connector.started'
  fetchUrl: string
  healthUrl: string
  pairingCode?: string
  pairingExpiresAt?: string
  versionUrl: string
}

function createStartupLog(port: number, authDisabled: boolean, pairingStore: PairingStore): ServerStartupLog {
  const pairingCode = pairingStore.getPairingCode()
  return {
    authDisabled,
    event: 'reqbin.connector.started',
    fetchUrl: `http://localhost:${port}/v1/fetch`,
    healthUrl: `http://localhost:${port}/health`,
    ...(authDisabled
      ? {}
      : {
          pairingCode: pairingCode.code,
          pairingExpiresAt: new Date(pairingCode.expiresAt).toISOString(),
        }),
    versionUrl: `http://localhost:${port}/version`,
  }
}

function logStartup(port: number, authDisabled: boolean, pairingStore: PairingStore): void {
  console.log(JSON.stringify(createStartupLog(port, authDisabled, pairingStore)))
}

export async function startServer({
  host = '127.0.0.1',
  listen = listenFastifyApp,
  port,
  pairingStore = new MemoryPairingStore(),
  ...appOptions
}: StartServerOptions = {}): Promise<FastifyInstance> {
  const app = await createApp({
    ...appOptions,
    pairingStore,
  })
  const listenPort = resolveServerPort(port)

  await listen(app, {
    host,
    port: listenPort,
  })

  logStartup(getListeningPort(app, listenPort), appOptions.auth?.authDisabled === true, pairingStore)

  return app
}
