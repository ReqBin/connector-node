import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_OPENAPI_OUTPUT_PATH, exportOpenApi } from '../../src/openapi/export-openapi.js'

let tempDir: string | undefined

describe('exportOpenApi', () => {
  afterEach(async () => {
    if (tempDir !== undefined) {
      await rm(tempDir, {
        force: true,
        recursive: true,
      })
    }
  })

  it('writes a generated OpenAPI document to a stable file path', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'reqbin-openapi-'))
    const outputPath = join(tempDir, DEFAULT_OPENAPI_OUTPUT_PATH)

    await exportOpenApi(outputPath)

    const spec = JSON.parse(await readFile(outputPath, 'utf8')) as {
      openapi: string
      paths: Record<string, unknown>
    }
    expect(spec.openapi).toBe('3.0.3')
    expect(spec).toMatchObject({
      components: {
        securitySchemes: {
          BearerAuth: {
            scheme: 'bearer',
            type: 'http',
          },
        },
      },
    })
    expect(Object.keys(spec.paths).sort()).toEqual([
      '/health',
      '/openapi.json',
      '/v1/fetch',
      '/v1/pair',
      '/version',
    ])
    expect(spec.paths['/v1/fetch']).toMatchObject({
      post: {
        requestBody: {
          content: {
            'application/json': {
              schema: {
                properties: {
                  json: {
                    type: 'string',
                  },
                },
              },
            },
          },
        },
        security: [
          {
            BearerAuth: [],
          },
        ],
      },
    })
  })
})
