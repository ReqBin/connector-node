#!/usr/bin/env node
import { parseAgentCliOptions } from '../src/cli/agent-options.js'
import { startServer } from '../src/index.js'

try {
  const options = parseAgentCliOptions(process.argv.slice(2))

  startServer({
    auth: {
      authDisabled: options.authDisabled,
    },
    cors: {
      allowedOrigins: options.allowedOrigins,
    },
    port: options.port,
  })
    .then((server) => {
      process.on('SIGINT', () => {
        server.close(() => process.exit(0))
      })
    })
    .catch((err: unknown) => {
      console.error('[reqbin-agent] failed to start:', err)
      process.exit(1)
    })
} catch (err) {
  console.error('[reqbin-agent] invalid options:', err instanceof Error ? err.message : String(err))
  process.exit(1)
}
