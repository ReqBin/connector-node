import { describe, expect, it } from 'vitest'
import { formatAgentHelp, formatAgentVersion } from '../../src/cli/agent-help.js'
import { parseAgentCliOptions } from '../../src/cli/agent-options.js'

describe('parseAgentCliOptions', () => {
  it('parses connector CLI flags', () => {
    expect(parseAgentCliOptions([
      '--host=0.0.0.0',
      '--port=8181',
      '--allow-origin',
      'http://localhost:5173/',
      '--allow-origin=https://beta.reqbin.com',
      '--dev',
      '--no-auth',
      '--request-timeout-ms',
      '60000',
      '--request-body-limit-bytes=1024',
      '--response-body-limit-bytes=2048',
      '--max-redirects=5',
    ])).toEqual({
      allowDevOrigins: true,
      allowedOrigins: ['http://localhost:5173', 'https://beta.reqbin.com'],
      authDisabled: true,
      host: '0.0.0.0',
      port: 8181,
      showHelp: false,
      showVersion: false,
      targetFetchOptions: {
        maxRedirects: 5,
        requestBodyLimitBytes: 1024,
        responseBodyLimitBytes: 2048,
        timeoutMs: 60000,
      },
    })
  })

  it('parses short port and direct port compatibility forms', () => {
    expect(parseAgentCliOptions(['-p', '9090'])).toMatchObject({ port: 9090 })
    expect(parseAgentCliOptions(['7071'])).toMatchObject({ port: 7071 })
  })

  it('parses separated value forms for configurable options', () => {
    expect(parseAgentCliOptions([
      '--host',
      '::1',
      '--request-body-limit-bytes',
      '1024',
      '--response-body-limit-bytes',
      '2048',
      '--max-redirects',
      '7',
      '-h',
      '-v',
    ])).toMatchObject({
      host: '::1',
      showHelp: true,
      showVersion: true,
      targetFetchOptions: {
        maxRedirects: 7,
        requestBodyLimitBytes: 1024,
        responseBodyLimitBytes: 2048,
      },
    })
  })

  it('rejects invalid options', () => {
    expect(() => parseAgentCliOptions(['--port', '0'])).toThrow('Invalid port: 0.')
    expect(() => parseAgentCliOptions(['--port', '70000'])).toThrow('Invalid port: 70000.')
    expect(() => parseAgentCliOptions(['--host', ' localhost'])).toThrow('Invalid host:  localhost.')
    expect(() => parseAgentCliOptions(['--allow-origin', 'https://reqbin.com/path'])).toThrow('Invalid origin: https://reqbin.com/path.')
    expect(() => parseAgentCliOptions(['--allow-origin', 'not-a-url'])).toThrow('Invalid origin: not-a-url.')
    expect(() => parseAgentCliOptions(['--allow-origin'])).toThrow('--allow-origin requires a value.')
    expect(() => parseAgentCliOptions(['--request-timeout-ms', '0'])).toThrow('Invalid --request-timeout-ms: 0.')
    expect(() => parseAgentCliOptions(['--unknown'])).toThrow('Unknown option: --unknown.')
  })

  it('parses help and version flags', () => {
    expect(parseAgentCliOptions(['--help'])).toMatchObject({ showHelp: true })
    expect(parseAgentCliOptions(['--version'])).toMatchObject({ showVersion: true })
    expect(formatAgentHelp()).toContain('Usage: reqbin-agent')
    expect(formatAgentVersion({
      name: '@reqbin/connector',
      protocolVersion: 'v1',
      version: '1.2.3',
    })).toBe('@reqbin/connector 1.2.3')
  })
})
