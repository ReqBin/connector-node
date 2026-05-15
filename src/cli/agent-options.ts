export interface AgentCliOptions {
  allowedOrigins: string[]
  authDisabled: boolean
  port?: number
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

export function parseAgentCliOptions(argv: string[]): AgentCliOptions {
  const options: AgentCliOptions = {
    allowedOrigins: [],
    authDisabled: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!

    if (arg === '--no-auth') {
      options.authDisabled = true
      continue
    }

    if (arg === '--allow-origin' || arg.startsWith('--allow-origin=')) {
      options.allowedOrigins.push(readOptionValue(argv, index, '--allow-origin'))
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

    if (/^\d{2,5}$/.test(arg)) {
      options.port = parsePort(arg)
      continue
    }

    throw new Error(`Unknown option: ${arg}.`)
  }

  return options
}
