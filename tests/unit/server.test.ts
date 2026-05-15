import type { FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { startServer } from '../../src/index.js'
import { listenFastifyApp, resolveServerPort } from '../../src/server.js'
import { MemoryPairingStore } from '../../src/security/pairing.js'

let app: FastifyInstance | undefined

async function closeApp(): Promise<void> {
  if (app?.server.listening) {
    await app.close()
  }
  app = undefined
}

function getLoggedStartupPayload(log: ReturnType<typeof vi.spyOn>): Record<string, unknown> {
  const message = log.mock.calls[0]?.[0]
  if (typeof message !== 'string') {
    throw new Error('Expected startup log message.')
  }

  return JSON.parse(message) as Record<string, unknown>
}

describe('server startup', () => {
  afterEach(async () => {
    await closeApp()
    vi.restoreAllMocks()
  })

  it('starts the Fastify connector app with the configured listener', async () => {
    const listen = vi.fn().mockResolvedValue(undefined)
    vi.spyOn(console, 'log').mockImplementation(() => undefined)

    app = await startServer({
      listen,
      port: 8181,
    })

    expect(listen).toHaveBeenCalledTimes(1)
    expect(listen.mock.calls[0]?.[0]).toBe(app)
    expect(listen.mock.calls[0]?.[1]).toEqual({
      host: '127.0.0.1',
      port: 8181,
    })
  })

  it('logs startup metadata for the public connector endpoints', async () => {
    const listen = vi.fn(async (target: FastifyInstance) => {
      vi.spyOn(target.server, 'address').mockReturnValue({
        address: '127.0.0.1',
        family: 'IPv4',
        port: 9091,
      })
    })
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)

    app = await startServer({
      listen,
      pairingStore: new MemoryPairingStore({
        codeGenerator: () => '123456',
        now: () => 1000,
        ttlMs: 300000,
      }),
      port: 8181,
    })

    const payload = getLoggedStartupPayload(log)

    expect(payload).toMatchObject({
      event: 'reqbin.connector.started',
      fetchUrl: 'http://localhost:9091/v1/fetch',
      healthUrl: 'http://localhost:9091/health',
      authDisabled: false,
      pairingCode: '123456',
      pairingExpiresAt: '1970-01-01T00:05:01.000Z',
      host: '127.0.0.1',
      openApiUrl: 'http://localhost:9091/openapi.json',
      versionUrl: 'http://localhost:9091/version',
    })
  })

  it('omits pairing codes from startup metadata when auth is disabled', async () => {
    const listen = vi.fn().mockResolvedValue(undefined)
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)

    app = await startServer({
      auth: {
        authDisabled: true,
      },
      listen,
      port: 8181,
    })

    const payload = getLoggedStartupPayload(log)

    expect(payload).toMatchObject({
      authDisabled: true,
      event: 'reqbin.connector.started',
    })
    expect(payload.pairingCode).toBeUndefined()
    expect(payload.pairingExpiresAt).toBeUndefined()
  })

  it('uses the configured host for listen options and startup URLs', async () => {
    const listen = vi.fn(async (target: FastifyInstance) => {
      vi.spyOn(target.server, 'address').mockReturnValue({
        address: '0.0.0.0',
        family: 'IPv4',
        port: 8181,
      })
    })
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)

    app = await startServer({
      host: '0.0.0.0',
      listen,
      port: 8181,
    })

    const payload = getLoggedStartupPayload(log)

    expect(listen).toHaveBeenCalledWith(app, {
      host: '0.0.0.0',
      port: 8181,
    })
    expect(payload).toMatchObject({
      fetchUrl: 'http://0.0.0.0:8181/v1/fetch',
      healthUrl: 'http://0.0.0.0:8181/health',
      host: '0.0.0.0',
      openApiUrl: 'http://0.0.0.0:8181/openapi.json',
    })
  })

  it('formats IPv6 startup URLs with brackets', async () => {
    const listen = vi.fn(async (target: FastifyInstance) => {
      vi.spyOn(target.server, 'address').mockReturnValue({
        address: '::1',
        family: 'IPv6',
        port: 8181,
      })
    })
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)

    app = await startServer({
      host: '::1',
      listen,
      port: 8181,
    })

    const payload = getLoggedStartupPayload(log)

    expect(payload).toMatchObject({
      fetchUrl: 'http://[::1]:8181/v1/fetch',
      healthUrl: 'http://[::1]:8181/health',
      openApiUrl: 'http://[::1]:8181/openapi.json',
    })
  })

  it('resolves explicit ports before environment ports', () => {
    expect(resolveServerPort(8181, '9090')).toBe(8181)
  })

  it('delegates the default listener to Fastify listen', async () => {
    const listen = vi.fn().mockResolvedValue('http://127.0.0.1:8181')

    await listenFastifyApp({
      listen,
    } as unknown as FastifyInstance, {
      host: '127.0.0.1',
      port: 8181,
    })

    expect(listen).toHaveBeenCalledWith({
      host: '127.0.0.1',
      port: 8181,
    })
  })

  it('resolves PORT when no explicit port is provided', () => {
    expect(resolveServerPort(undefined, '9090')).toBe(9090)
  })

  it('uses port 7070 when no explicit port or PORT environment is set', () => {
    expect(resolveServerPort(undefined, undefined)).toBe(7070)
  })
})
