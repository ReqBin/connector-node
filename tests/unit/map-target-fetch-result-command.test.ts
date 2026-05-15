import { describe, expect, it } from 'vitest'
import { MapTargetFetchResultCommand } from '../../src/fetch/commands/MapTargetFetchResultCommand.js'
import type { TargetFetchResult } from '../../src/fetch/types.js'

const command = new MapTargetFetchResultCommand()

function encode(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}

describe('MapTargetFetchResultCommand', () => {
  it('maps successful text target responses to sender response payloads', async () => {
    const result: TargetFetchResult = {
      ok: true,
      response: {
        body: encode('{"ok":true}'),
        contentType: 'application/json; charset=utf-8',
        elapsedMs: 42,
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'x-target': 'ok',
        },
        status: 202,
        statusText: 'Accepted',
      },
    }

    await expect(command.execute(result)).resolves.toEqual({
      Content: '{"ok":true}',
      ContentLength: 11,
      ContentRaw: 'eyJvayI6dHJ1ZX0=',
      ContentType: 'application/json; charset=utf-8',
      Elapsed: 42,
      Headers: 'content-type: application/json; charset=utf-8\r\nx-target: ok\r\n',
      RedirectUrl: '',
      Redirects: [],
      RedirectsCount: 0,
      RedirectsTime: 0,
      StatusCode: 202,
      StatusDescription: 'Accepted',
      Success: true,
      Timings: {
        Connecting: 0,
        DNS: 0,
        Receiving: 0,
        Sending: 0,
        TLS: 0,
        Total: 0.042,
        Waiting: 0,
      },
      Version: '1.1',
    })
  })

  it('maps binary target responses without forcing text content', async () => {
    const result: TargetFetchResult = {
      ok: true,
      response: {
        body: new Uint8Array([0, 1, 2, 3]),
        contentType: 'image/png',
        elapsedMs: 7,
        headers: {},
        status: 200,
        statusText: 'OK',
      },
    }

    await expect(command.execute(result)).resolves.toMatchObject({
      Content: '',
      ContentLength: 4,
      ContentRaw: 'AAECAw==',
      ContentType: 'image/png',
      Headers: '',
      StatusCode: 200,
      StatusDescription: 'OK',
      Success: true,
    })
  })

  it('maps target responses without status text to a standard status description', async () => {
    const result: TargetFetchResult = {
      ok: true,
      response: {
        body: new Uint8Array(),
        contentType: '',
        elapsedMs: 0,
        headers: {},
        status: 404,
        statusText: '',
      },
    }

    await expect(command.execute(result)).resolves.toMatchObject({
      Content: '',
      ContentLength: 0,
      ContentRaw: '',
      ContentType: '',
      StatusCode: 404,
      StatusDescription: 'Not Found',
      Success: true,
    })
  })

  it('keeps unknown empty status descriptions empty', async () => {
    const result: TargetFetchResult = {
      ok: true,
      response: {
        body: new Uint8Array(),
        contentType: '',
        elapsedMs: 0,
        headers: {},
        status: 599,
        statusText: '',
      },
    }

    await expect(command.execute(result)).resolves.toMatchObject({
      StatusCode: 599,
      StatusDescription: '',
      Success: true,
    })
  })

  it('maps target execution failures to status-zero sender errors', async () => {
    const result: TargetFetchResult = {
      code: 'timeout',
      message: 'Target request timed out.',
      ok: false,
    }

    await expect(command.execute(result)).resolves.toEqual({
      Content: 'Target request timed out.',
      ContentLength: 25,
      ContentRaw: '',
      ContentType: 'text/plain; charset=utf-8',
      Elapsed: 0,
      Headers: '',
      RedirectUrl: '',
      Redirects: [],
      RedirectsCount: 0,
      RedirectsTime: 0,
      StatusCode: 0,
      StatusDescription: 'Error',
      Success: false,
      Timings: {
        Connecting: 0,
        DNS: 0,
        Receiving: 0,
        Sending: 0,
        TLS: 0,
        Total: 0,
        Waiting: 0,
      },
      Version: '1.1',
    })
  })
})
