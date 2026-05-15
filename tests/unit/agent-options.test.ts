import { describe, expect, it } from 'vitest'
import { parseAgentCliOptions } from '../../src/cli/agent-options.js'

describe('parseAgentCliOptions', () => {
  it('parses port aliases, allowed origins, and auth override', () => {
    expect(parseAgentCliOptions([
      '--port=8181',
      '--allow-origin',
      'http://localhost:5173',
      '--allow-origin=https://beta.reqbin.com',
      '--no-auth',
    ])).toEqual({
      allowedOrigins: ['http://localhost:5173', 'https://beta.reqbin.com'],
      authDisabled: true,
      port: 8181,
    })
  })

  it('parses short port and direct port compatibility forms', () => {
    expect(parseAgentCliOptions(['-p', '9090'])).toMatchObject({ port: 9090 })
    expect(parseAgentCliOptions(['7071'])).toMatchObject({ port: 7071 })
  })

  it('rejects invalid options', () => {
    expect(() => parseAgentCliOptions(['--port', '0'])).toThrow('Invalid port: 0.')
    expect(() => parseAgentCliOptions(['--allow-origin'])).toThrow('--allow-origin requires a value.')
    expect(() => parseAgentCliOptions(['--unknown'])).toThrow('Unknown option: --unknown.')
  })
})
