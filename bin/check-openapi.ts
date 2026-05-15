#!/usr/bin/env node
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

async function checkOpenApi(): Promise<void> {
  await execFileAsync('node', ['dist/bin/export-openapi.js'])
  try {
    await execFileAsync('git', ['diff', '--exit-code', '--', 'docs/openapi.json'])
  } catch (err) {
    console.error('[reqbin-agent] docs/openapi.json is stale. Run npm run openapi:export and commit the result.')
    throw err
  }
}

checkOpenApi()
  .catch(() => {
    process.exit(1)
  })
