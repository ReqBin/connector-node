import { afterEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { readFileSync } from 'node:fs'
import { createApp } from '../../src/http/app.js'
import { createConnectorInfo, createDefaultConnectorInfo, readConnectorPackageJson } from '../../src/http/connector-info.js'

const packageJson = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
  name: string
  version: string
}

let app: FastifyInstance | undefined

async function createTestApp() {
  app = await createApp()
  return app
}

describe('Fastify app factory', () => {
  afterEach(async () => {
    await app?.close()
    app = undefined
  })

  it('creates a Fastify app with the health route', async () => {
    const testApp = await createTestApp()

    const response = await testApp.inject({
      method: 'GET',
      url: '/health',
    })

    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toContain('application/json')
    expect(response.json()).toEqual({ status: 'up' })
  })

  it('returns default connector version metadata', async () => {
    const testApp = await createTestApp()

    const response = await testApp.inject({
      method: 'GET',
      url: '/version',
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      name: packageJson.name,
      protocolVersion: 'v1',
      version: packageJson.version,
    })
    expect(createDefaultConnectorInfo()).toEqual(response.json())
  })

  it('allows connector metadata to be injected', async () => {
    const connectorInfo = {
      name: '@reqbin/connector-test',
      protocolVersion: 'v1',
      version: '9.9.9',
    }
    app = await createApp({ connectorInfo })

    const response = await app.inject({
      method: 'GET',
      url: '/version',
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual(connectorInfo)
  })

  it('builds connector metadata with defaults for invalid package fields', () => {
    expect(createConnectorInfo({
      name: '',
      version: undefined,
    })).toEqual({
      name: '@reqbin/connector',
      protocolVersion: 'v1',
      version: '0.0.0',
    })
  })

  it('reads package metadata from the fallback source layout path', () => {
    expect(readConnectorPackageJson([
      './missing-package.json',
      '../../package.json',
    ])).toEqual(packageJson)
  })

  it('fails when package metadata cannot be found', () => {
    expect(() => readConnectorPackageJson([
      './missing-package.json',
    ])).toThrow('Unable to read connector package metadata.')
  })

  it('generates OpenAPI JSON for registered routes', async () => {
    const testApp = await createTestApp()

    const response = await testApp.inject({
      method: 'GET',
      url: '/openapi.json',
    })

    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toContain('application/json')
    expect(response.json()).toMatchObject({
      info: {
        title: 'ReqBin Connector API',
        version: packageJson.version,
      },
      openapi: '3.0.3',
      paths: {
        '/health': {},
        '/openapi.json': {},
        '/version': {},
      },
    })
  })
})
