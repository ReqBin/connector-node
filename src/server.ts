import type { FastifyInstance } from 'fastify'
import { createApp, type CreateAppOptions } from './http/app.js'

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

function logStartup(port: number): void {
  console.log(JSON.stringify({
    event: 'reqbin.connector.started',
    fetchUrl: `http://localhost:${port}/v1/fetch`,
    healthUrl: `http://localhost:${port}/health`,
    versionUrl: `http://localhost:${port}/version`,
  }))
}

export async function startServer({
  host = '127.0.0.1',
  listen = listenFastifyApp,
  port,
  ...appOptions
}: StartServerOptions = {}): Promise<FastifyInstance> {
  const app = await createApp(appOptions)
  const listenPort = resolveServerPort(port)

  await listen(app, {
    host,
    port: listenPort,
  })

  logStartup(getListeningPort(app, listenPort))

  return app
}
