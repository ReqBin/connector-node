#!/usr/bin/env node
import { exportOpenApi } from '../src/openapi/export-openapi.js'

exportOpenApi(process.argv[2])
  .catch((err: unknown) => {
    console.error('[reqbin-agent] failed to export OpenAPI:', err)
    process.exit(1)
  })
