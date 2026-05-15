#!/usr/bin/env node
import { parseAgentCliOptions } from '../src/cli/agent-options.js'
import { formatAgentHelp, formatAgentVersion } from '../src/cli/agent-help.js'
import { startServer } from '../src/index.js'
import { createDefaultConnectorInfo } from '../src/http/connector-info.js'

try {
  const options = parseAgentCliOptions(process.argv.slice(2))
  const connectorInfo = createDefaultConnectorInfo()

  if (options.showHelp) {
    console.log(formatAgentHelp())
    process.exit(0)
  }

  if (options.showVersion) {
    console.log(formatAgentVersion(connectorInfo))
    process.exit(0)
  }

  startServer({
    auth: {
      authDisabled: options.authDisabled,
    },
    connectorInfo,
    cors: {
      allowDevOrigins: options.allowDevOrigins,
      allowedOrigins: options.allowedOrigins,
    },
    host: options.host,
    port: options.port,
    targetFetchOptions: options.targetFetchOptions,
  })
    .then((server) => {
      const close = () => {
        server.close(() => process.exit(0))
      }
      process.on('SIGINT', close)
      process.on('SIGTERM', close)
    })
    .catch((err: unknown) => {
      console.error('[reqbin-agent] failed to start:', err)
      process.exit(1)
    })
} catch (err) {
  console.error('[reqbin-agent] invalid options:', err instanceof Error ? err.message : String(err))
  process.exit(1)
}
