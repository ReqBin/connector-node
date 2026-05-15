import type { TargetFetchOptions } from '../fetch/target-fetch-options.js'

export interface AgentCliOptions {
  allowDevOrigins: boolean
  allowedOrigins: string[]
  authDisabled: boolean
  host?: string
  port?: number
  showHelp: boolean
  showVersion: boolean
  targetFetchOptions: TargetFetchOptions
}

function readOptionValue(argv: string[], index: number, option: string): string {
  const raw = argv[index]!
  if (raw.includes('=')) {
    const value = raw.split('=').slice(1).join('=')
    if (value.length > 0) {
      return value
    }
  }

  const value = argv[index + 1]
  if (value === undefined || value.startsWith('-')) {
    throw new Error(`${option} requires a value.`)
  }

  return value
}

function parsePort(value: string): number {
  const port = Number(value)
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`Invalid port: ${value}.`)
  }

  return port
}

function parsePositiveInteger(value: string, option: string): number {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`Invalid ${option}: ${value}.`)
  }

  return parsed
}

function parseHost(value: string): string {
  const host = value.trim()
  if (host.length === 0 || host !== value) {
    throw new Error(`Invalid host: ${value}.`)
  }

  return host
}

function parseOrigin(value: string): string {
  try {
    const url = new URL(value)
    const normalizedInput = value.endsWith('/') ? value.slice(0, -1) : value
    if (url.origin === 'null' || url.origin !== normalizedInput) {
      throw new Error()
    }

    return url.origin
  } catch {
    throw new Error(`Invalid origin: ${value}.`)
  }
}

export function parseAgentCliOptions(argv: string[]): AgentCliOptions {
  const options: AgentCliOptions = {
    allowDevOrigins: false,
    allowedOrigins: [],
    authDisabled: false,
    showHelp: false,
    showVersion: false,
    targetFetchOptions: {},
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!

    if (arg === '--no-auth') {
      options.authDisabled = true
      continue
    }

    if (arg === '--dev') {
      options.allowDevOrigins = true
      continue
    }

    if (arg === '--help' || arg === '-h') {
      options.showHelp = true
      continue
    }

    if (arg === '--version' || arg === '-v') {
      options.showVersion = true
      continue
    }

    if (arg === '--allow-origin' || arg.startsWith('--allow-origin=')) {
      options.allowedOrigins.push(parseOrigin(readOptionValue(argv, index, '--allow-origin')))
      if (!arg.includes('=')) {
        index += 1
      }
      continue
    }

    if (arg === '--host' || arg.startsWith('--host=')) {
      options.host = parseHost(readOptionValue(argv, index, '--host'))
      if (!arg.includes('=')) {
        index += 1
      }
      continue
    }

    if (arg === '-p' || arg === '--port' || arg.startsWith('--port=')) {
      options.port = parsePort(readOptionValue(argv, index, arg.startsWith('-p') ? '-p' : '--port'))
      if (!arg.includes('=')) {
        index += 1
      }
      continue
    }

    if (arg === '--request-timeout-ms' || arg.startsWith('--request-timeout-ms=')) {
      options.targetFetchOptions.timeoutMs = parsePositiveInteger(
        readOptionValue(argv, index, '--request-timeout-ms'),
        '--request-timeout-ms',
      )
      if (!arg.includes('=')) {
        index += 1
      }
      continue
    }

    if (arg === '--request-body-limit-bytes' || arg.startsWith('--request-body-limit-bytes=')) {
      options.targetFetchOptions.requestBodyLimitBytes = parsePositiveInteger(
        readOptionValue(argv, index, '--request-body-limit-bytes'),
        '--request-body-limit-bytes',
      )
      if (!arg.includes('=')) {
        index += 1
      }
      continue
    }

    if (arg === '--response-body-limit-bytes' || arg.startsWith('--response-body-limit-bytes=')) {
      options.targetFetchOptions.responseBodyLimitBytes = parsePositiveInteger(
        readOptionValue(argv, index, '--response-body-limit-bytes'),
        '--response-body-limit-bytes',
      )
      if (!arg.includes('=')) {
        index += 1
      }
      continue
    }

    if (arg === '--max-redirects' || arg.startsWith('--max-redirects=')) {
      options.targetFetchOptions.maxRedirects = parsePositiveInteger(
        readOptionValue(argv, index, '--max-redirects'),
        '--max-redirects',
      )
      if (!arg.includes('=')) {
        index += 1
      }
      continue
    }

    if (/^\d{2,5}$/.test(arg)) {
      options.port = parsePort(arg)
      continue
    }

    throw new Error(`Unknown option: ${arg}.`)
  }

  return options
}
