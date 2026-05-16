import type { FastifyInstance } from 'fastify'
import { createApp, type CreateAppOptions } from './http/app.js'
import { MemoryPairingStore, type PairingCodeSnapshot, type PairingStore } from './security/pairing.js'

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
  host: string
  openApiUrl: string
  pairingCode?: string
  pairingExpiresAt?: string
  versionUrl: string
}

export interface ServerPairingCodeLog {
  event: 'reqbin.connector.pairing_code'
  message: string
  pairingCode: string
  pairingExpiresAt: string
}

function formatUrlHost(host: string): string {
  if (host === '127.0.0.1') {
    return 'localhost'
  }

  return host.includes(':') && !host.startsWith('[') ? `[${host}]` : host
}

function createPairingCodeLog(pairingCode: PairingCodeSnapshot): ServerPairingCodeLog {
  return {
    event: 'reqbin.connector.pairing_code',
    message: `ReqBin pairing code: ${pairingCode.code}`,
    pairingCode: pairingCode.code,
    pairingExpiresAt: new Date(pairingCode.expiresAt).toISOString(),
  }
}

function createStartupLog(
  host: string,
  port: number,
  authDisabled: boolean,
  pairingCode: PairingCodeSnapshot | undefined,
): ServerStartupLog {
  const baseUrl = `http://${formatUrlHost(host)}:${port}`
  return {
    authDisabled,
    event: 'reqbin.connector.started',
    fetchUrl: `${baseUrl}/v1/fetch`,
    healthUrl: `${baseUrl}/health`,
    host,
    openApiUrl: `${baseUrl}/openapi.json`,
    ...(pairingCode === undefined
      ? {}
      : {
          pairingCode: pairingCode.code,
          pairingExpiresAt: new Date(pairingCode.expiresAt).toISOString(),
        }),
    versionUrl: `${baseUrl}/version`,
  }
}

function logStartup(host: string, port: number, authDisabled: boolean, pairingStore: PairingStore): void {
  const pairingCode = authDisabled ? undefined : pairingStore.getPairingCode()
  if (pairingCode !== undefined) {
    console.log(JSON.stringify(createPairingCodeLog(pairingCode)))
  }
  console.log(JSON.stringify(createStartupLog(host, port, authDisabled, pairingCode)))
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

  logStartup(host, getListeningPort(app, listenPort), appOptions.auth?.authDisabled === true, pairingStore)

  return app
}
