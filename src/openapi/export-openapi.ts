import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { createApp } from '../http/app.js'

export const DEFAULT_OPENAPI_OUTPUT_PATH = 'docs/openapi.json'

export async function exportOpenApi(outputPath = DEFAULT_OPENAPI_OUTPUT_PATH): Promise<void> {
  const app = await createApp()
  const resolvedOutputPath = resolve(outputPath)

  try {
    await app.ready()
    await mkdir(dirname(resolvedOutputPath), {
      recursive: true,
    })
    await writeFile(resolvedOutputPath, `${JSON.stringify(app.swagger(), null, 2)}\n`)
  } finally {
    await app.close()
  }
}
